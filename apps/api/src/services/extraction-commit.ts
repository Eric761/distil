import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DocumentEventKind, FieldType } from "@invoice/contracts";
import { GENERIC_DOCUMENT_TYPE } from "@invoice/contracts";
import type { ExtractionResult } from "@invoice/extraction";
import type { Database } from "../db/client.js";
import {
  documentEvents,
  documents,
  extractionFields,
  extractions,
  sourceReferences,
  type DocumentRow,
} from "../db/schema.js";
import { isDecimalString } from "../lib/money.js";
import { rulesForSchema } from "../lib/rules.js";
import {
  approvalBlockers,
  computeNeedsAttention,
  docReviewStatus,
  validateFields,
  type WorkingField,
} from "../lib/validation.js";
import { registerAdHocSchema } from "./schema-service.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/u;

/** Typed index columns for the generic value index (search/eq/range queries). */
export function typedIndexColumns(
  type: FieldType,
  value: unknown,
): { valueText: string | null; valueNumeric: string | null; valueDate: string | null; valueBoolean: boolean | null } {
  if (value === null || value === undefined) {
    return { valueText: null, valueNumeric: null, valueDate: null, valueBoolean: null };
  }
  const str =
    typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : null;

  let valueNumeric: string | null = null;
  if ((type === "decimal" || type === "integer") && str && isDecimalString(str)) {
    valueNumeric = str;
  }
  let valueDate: string | null = null;
  if ((type === "date" || type === "datetime") && str) {
    const m = ISO_DATE.exec(str);
    if (m) valueDate = str.slice(0, 10);
  }
  let valueBoolean: boolean | null = null;
  if (type === "boolean") {
    if (typeof value === "boolean") valueBoolean = value;
    else if (str) valueBoolean = /^(true|yes)$/iu.test(str);
  }
  const valueText = str && type !== "object" && type !== "array" ? str.slice(0, 8000) : null;
  return { valueText, valueNumeric, valueDate, valueBoolean };
}

/** Split an instance path into tokens, e.g. "lineItems[2].total" -> ["lineItems",2,"total"]. */
function tokenizePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  for (const seg of path.split(".")) {
    const m = /^([^[]+)((?:\[\d+\])*)$/u.exec(seg);
    if (!m) {
      tokens.push(seg);
      continue;
    }
    tokens.push(m[1]!);
    const idx = m[2]!.matchAll(/\[(\d+)\]/gu);
    for (const g of idx) tokens.push(Number(g[1]));
  }
  return tokens;
}

/** Derive a nested JSON view of effective values, keyed by instance path. */
export function deriveData(
  entries: Array<{ path: string; nodeKind: string; value: unknown }>,
): unknown {
  const root: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry.nodeKind !== "scalar") continue;
    const tokens = tokenizePath(entry.path);
    let cursor: any = root;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]!;
      const last = i === tokens.length - 1;
      if (last) {
        cursor[token] = entry.value;
      } else {
        const nextToken = tokens[i + 1]!;
        const container = typeof nextToken === "number" ? [] : {};
        if (cursor[token] === undefined) cursor[token] = container;
        cursor = cursor[token];
      }
    }
  }
  return root;
}

export async function writeEvent(
  tx: Tx,
  documentId: string,
  kind: DocumentEventKind,
  summary: string,
  extractionId: string | null = null,
): Promise<void> {
  await tx.insert(documentEvents).values({ documentId, kind, summary, extractionId });
}

/**
 * Commit a generic (structural or LLM) extraction result: append a new
 * extraction row (never delete history), write typed fields + grounded source
 * references, register the inferred schema, and repoint the document. Returns
 * the new extraction id.
 */
export async function commitGenericExtraction(
  tx: Tx,
  document: DocumentRow,
  result: ExtractionResult,
  meta: {
    parseId: string | null;
    sourceKind: "pdf" | "text";
    providerModel?: string;
    pages: Array<{ page: number; widthPt: number; heightPt: number }>;
    schemaVersionId?: string | null;
  },
): Promise<string> {
  const extractionId = randomUUID();

  const registered = meta.schemaVersionId ? null : await registerAdHocSchema(tx, result.schema);
  const versionId = meta.schemaVersionId ?? registered!.versionId;

  const ruleKeys = rulesForSchema(result.schema.key);
  const prepared = result.fields.map((f, index) => ({ id: randomUUID(), sortOrder: index, field: f }));
  const seenPaths = new Set<string>();
  for (const p of prepared) {
    if (seenPaths.has(p.field.path)) {
      throw new Error(`Duplicate extraction field path: ${p.field.path}`);
    }
    seenPaths.add(p.field.path);
  }
  const working: WorkingField[] = prepared.map((p) => ({
    id: p.id,
    path: p.field.path,
    group: p.field.group,
    type: p.field.type,
    required: p.field.required,
    material: p.field.material,
    label: p.field.label,
    extractedValue: p.field.value,
    correctedValue: null,
    reviewState: "needs_review",
    confidenceState: p.field.confidenceState,
  }));
  const validations = validateFields(working, ruleKeys);

  await tx.insert(extractions).values({
    id: extractionId,
    documentId: document.id,
    schemaVersion: `${result.schema.key}@${result.schema.version}`,
    schemaKey: result.schema.key,
    schemaVersionId: versionId,
    parseId: meta.parseId,
    parentExtractionId: document.currentExtractionId,
    engineVersion: "distil-engine.v1",
    extractorKey: result.extractorKey,
    providerModel: meta.providerModel ?? null,
    sourceKind: meta.sourceKind,
    status: result.status,
    statusNote: result.statusNote,
    presentSections: result.presentSections,
    pages: meta.pages,
    rawPayload: { schema: result.schema } as unknown as object,
    version: 1,
  });

  for (const p of prepared) {
    const wf = working.find((w) => w.id === p.id)!;
    const validation = validations.get(p.id) ?? { state: "not_checked" as const, issues: [] };
    const attention = computeNeedsAttention(wf, validation);
    const reviewState = attention ? "needs_review" : "auto_accepted";
    const typed = typedIndexColumns(p.field.type, p.field.value);

    await tx.insert(extractionFields).values({
      id: p.id,
      extractionId,
      path: p.field.path,
      schemaFieldKey: p.field.schemaFieldKey,
      label: p.field.label,
      fieldGroup: p.field.group,
      type: p.field.type,
      nodeKind: p.field.nodeKind,
      required: p.field.required,
      material: p.field.material,
      presenceState: p.field.presenceState,
      valueOrigin: p.field.valueOrigin,
      extractedValue: (p.field.value ?? null) as object | null,
      correctedValue: null,
      valueText: typed.valueText,
      valueNumeric: typed.valueNumeric,
      valueDate: typed.valueDate,
      valueBoolean: typed.valueBoolean,
      confidenceScore: p.field.confidenceScore,
      confidenceState: p.field.confidenceState,
      confidenceReason: p.field.confidenceReason,
      parseConfidence: p.field.parseConfidence,
      validationState: validation.state,
      validationIssues: validation.issues,
      reviewState,
      needsAttention: attention,
      conflictCandidates: [],
      sortOrder: p.sortOrder,
    });

    for (let i = 0; i < p.field.sources.length; i += 1) {
      const span = p.field.sources[i]!;
      await tx.insert(sourceReferences).values({
        id: `${p.id}:src${i}`,
        fieldId: p.id,
        page: span.page,
        box: null,
        offsetStart: span.offsetStart,
        offsetEnd: span.offsetEnd,
        groundingStatus: span.groundingStatus,
        regions: [],
        sourceText: span.quote,
        candidateRank: null,
      });
    }
  }

  const blockers = approvalBlockers(working, validations);
  const reviewStatus = docReviewStatus(blockers);

  await tx
    .update(documents)
    .set({
      documentType: GENERIC_DOCUMENT_TYPE,
      schemaName: result.schema.name,
      sourceKind: meta.sourceKind,
      processingStatus: result.status === "degraded" ? "partial" : result.status === "partial" ? "partial" : "succeeded",
      reviewStatus,
      processingPhase: null,
      failureCode: null,
      failureMessage: null,
      currentExtractionId: extractionId,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, document.id));

  await writeEvent(tx, document.id, "extraction_created", `Extracted with ${result.extractorKey} engine.`, extractionId);
  await writeEvent(tx, document.id, "extraction_promoted", `Promoted extraction to current.`, extractionId);

  return extractionId;
}
