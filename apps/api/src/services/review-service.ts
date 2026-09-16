import { and, asc, eq, inArray } from "drizzle-orm";
import {
  ERROR_CODES,
  type ApproveRequest,
  type ExtractionDetail,
  type ExtractionField,
  type SaveExtractionRequest,
  type SchemaFieldDef,
  type SchemaTree,
  type SourceReference,
} from "@invoice/contracts";
import { getDb, type Database } from "../db/client.js";
import {
  documents,
  documentRecords,
  extractionFields,
  extractions,
  fieldCorrections,
  invoiceRecords,
  sourceReferences,
  type ExtractionFieldRow,
} from "../db/schema.js";
import { AppError, notFound } from "../lib/errors.js";
import { rulesForSchema } from "../lib/rules.js";
import {
  approvalBlockers,
  computeNeedsAttention,
  docReviewStatus,
  effectiveValue,
  reviewProgress,
  validateFields,
  type FieldValidation,
  type WorkingField,
} from "../lib/validation.js";
import { buildNormalizedDraft, upsertInvoiceProjection } from "./processing-service.js";
import { deriveData, typedIndexColumns, writeEvent } from "./extraction-commit.js";
import {
  buildInvoiceSchemaTree,
  buildResumeSchemaTree,
  INVOICE_SCHEMA_KEY,
  RESUME_SCHEMA_KEY,
} from "./schema-service.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

function toWorking(row: ExtractionFieldRow): WorkingField {
  return {
    id: row.id,
    path: row.path,
    group: row.fieldGroup,
    type: row.type,
    required: row.required,
    material: row.material,
    label: row.label,
    extractedValue: row.extractedValue ?? null,
    correctedValue: row.correctedValue ?? null,
    reviewState: row.reviewState,
    confidenceState: row.confidenceState,
  };
}

function mapField(
  row: ExtractionFieldRow,
  refs: SourceReference[],
  validation: FieldValidation,
  attention: boolean,
): ExtractionField {
  const working = toWorking(row);
  return {
    id: row.id,
    path: row.path,
    schemaFieldKey: row.schemaFieldKey ?? row.path,
    label: row.label,
    group: row.fieldGroup,
    type: row.type,
    nodeKind: (row.nodeKind as ExtractionField["nodeKind"]) ?? "scalar",
    required: row.required,
    material: row.material,
    extractedValue: row.extractedValue ?? null,
    correctedValue: row.correctedValue ?? null,
    effectiveValue: effectiveValue(working),
    presenceState: (row.presenceState as ExtractionField["presenceState"]) ?? "present",
    valueOrigin: (row.valueOrigin as ExtractionField["valueOrigin"]) ?? "extracted",
    confidenceScore: row.confidenceScore,
    confidenceState: row.confidenceState,
    confidenceReason: row.confidenceReason,
    parseConfidence: row.parseConfidence ?? null,
    validationState: validation.state,
    validationIssues: validation.issues,
    reviewState: row.reviewState,
    correctedAt: row.correctedAt ? row.correctedAt.toISOString() : null,
    needsAttention: attention,
    sourceReferences: refs,
    conflictCandidates: row.conflictCandidates,
  };
}

async function loadExtractionContext(documentId: string): Promise<{
  document: typeof documents.$inferSelect;
  extraction: typeof extractions.$inferSelect;
  rows: ExtractionFieldRow[];
  refsByField: Map<string, SourceReference[]>;
}> {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw notFound("Document not found.");
  if (!doc.currentExtractionId) {
    throw new AppError({
      code: ERROR_CODES.EXTRACTION_NOT_READY,
      status: 409,
      title: "Not ready",
      detail: "This document has no extraction to review yet.",
      meta: { processingStatus: doc.processingStatus },
    });
  }

  const [extraction] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.id, doc.currentExtractionId))
    .limit(1);
  if (!extraction) throw notFound("Extraction not found.");

  const rows = await db
    .select()
    .from(extractionFields)
    .where(eq(extractionFields.extractionId, extraction.id))
    .orderBy(asc(extractionFields.sortOrder));

  const fieldIds = rows.map((r) => r.id);
  const refs =
    fieldIds.length > 0
      ? await db.select().from(sourceReferences).where(inArray(sourceReferences.fieldId, fieldIds))
      : [];

  const refsByField = new Map<string, SourceReference[]>();
  for (const ref of refs) {
    const list = refsByField.get(ref.fieldId) ?? [];
    list.push({
      id: ref.id,
      page: ref.page,
      box: ref.box ?? null,
      offsetStart: ref.offsetStart ?? null,
      offsetEnd: ref.offsetEnd ?? null,
      groundingStatus: (ref.groundingStatus as SourceReference["groundingStatus"]) ?? "grounded",
      regions: (ref.regions as SourceReference["regions"]) ?? [],
      sourceText: ref.sourceText,
      candidateRank: ref.candidateRank,
    });
    refsByField.set(ref.fieldId, list);
  }

  return { document: doc, extraction, rows, refsByField };
}

/** The schema this extraction was produced against (stored at commit time). */
function schemaFor(extraction: typeof extractions.$inferSelect, rows: ExtractionFieldRow[]): SchemaTree {
  const payload = extraction.rawPayload as { schema?: SchemaTree } | null;
  if (payload && payload.schema && Array.isArray(payload.schema.fields)) {
    return payload.schema;
  }
  if (extraction.schemaKey === INVOICE_SCHEMA_KEY) return buildInvoiceSchemaTree();
  if (extraction.schemaKey === RESUME_SCHEMA_KEY) return buildResumeSchemaTree();
  // Fallback: synthesize a flat schema from the committed fields.
  const seen = new Set<string>();
  const fields: SchemaFieldDef[] = [];
  for (const row of rows) {
    const key = row.schemaFieldKey ?? row.path;
    if (seen.has(key) || key.includes("[].")) continue;
    seen.add(key);
    fields.push({
      key,
      label: row.label,
      type: row.type,
      nodeKind: (row.nodeKind as SchemaFieldDef["nodeKind"]) ?? "scalar",
      group: row.fieldGroup,
      required: row.required,
      material: row.material,
    });
  }
  return { key: extraction.schemaKey ?? "document", name: "Document", version: "draft", status: "draft", adHoc: true, fields };
}

function assemble(context: Awaited<ReturnType<typeof loadExtractionContext>>): ExtractionDetail {
  const { document, extraction, rows, refsByField } = context;
  const working = rows.map(toWorking);
  const ruleKeys = rulesForSchema(extraction.schemaKey);
  const validations = validateFields(working, ruleKeys);

  const fieldsDto: ExtractionField[] = [];
  const dataEntries: Array<{ path: string; nodeKind: string; value: unknown }> = [];

  for (const row of rows) {
    const validation = validations.get(row.id) ?? { state: "not_checked" as const, issues: [] };
    const wf = toWorking(row);
    const attention = computeNeedsAttention(wf, validation);
    fieldsDto.push(mapField(row, refsByField.get(row.id) ?? [], validation, attention));
    dataEntries.push({ path: row.path, nodeKind: row.nodeKind ?? "scalar", value: effectiveValue(wf) });
  }

  const blockers = approvalBlockers(working, validations);
  const progress = reviewProgress(working, validations);

  return {
    documentId: document.id,
    extractionId: extraction.id,
    version: extraction.version,
    documentType: document.documentType,
    schemaVersion: extraction.schemaVersion,
    schemaVersionId: extraction.schemaVersionId,
    schema: schemaFor(extraction, rows),
    sourceKind: (extraction.sourceKind as ExtractionDetail["sourceKind"]) ?? "pdf",
    status: extraction.status as ExtractionDetail["status"],
    presentSections: extraction.presentSections,
    fields: fieldsDto,
    data: deriveData(dataEntries),
    progress,
    approvalBlockers: blockers,
    statusNote: extraction.statusNote ?? null,
    pages: extraction.pages,
  };
}

function dataForWorking(rows: ExtractionFieldRow[], working: WorkingField[]): unknown {
  const byId = new Map(working.map((wf) => [wf.id, wf]));
  return deriveData(
    rows.map((row) => {
      const wf = byId.get(row.id) ?? toWorking(row);
      return { path: row.path, nodeKind: row.nodeKind ?? "scalar", value: effectiveValue(wf) };
    }),
  );
}

export async function getExtractionDetail(documentId: string): Promise<ExtractionDetail> {
  const context = await loadExtractionContext(documentId);
  return assemble(context);
}

/** Recompute derived field state (typed columns, validation, review flags) and
 * refresh the invoice projection when this is an invoice extraction. */
async function persistDerived(
  tx: Tx,
  document: typeof documents.$inferSelect,
  extraction: typeof extractions.$inferSelect,
  version: number,
  working: WorkingField[],
  rows: ExtractionFieldRow[],
  approvedAt: Date | null,
): Promise<void> {
  const ruleKeys = rulesForSchema(extraction.schemaKey);
  const validations = validateFields(working, ruleKeys);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const wf of working) {
    const validation = validations.get(wf.id) ?? { state: "not_checked" as const, issues: [] };
    const attention = computeNeedsAttention(wf, validation);
    const row = byId.get(wf.id)!;
    const eff = effectiveValue(wf);
    const typed = typedIndexColumns(wf.type, eff);
    await tx
      .update(extractionFields)
      .set({
        correctedValue: (wf.correctedValue ?? null) as object | null,
        reviewState: wf.reviewState,
        presenceState: wf.reviewState === "not_applicable" ? "not_applicable" : row.presenceState,
        valueOrigin: wf.reviewState === "corrected" ? "extracted" : row.valueOrigin,
        valueText: typed.valueText,
        valueNumeric: typed.valueNumeric,
        valueDate: typed.valueDate,
        valueBoolean: typed.valueBoolean,
        validationState: validation.state,
        validationIssues: validation.issues,
        needsAttention: attention,
        correctedAt: wf.reviewState === "corrected" ? (row.correctedAt ?? new Date()) : row.correctedAt,
      })
      .where(eq(extractionFields.id, wf.id));
  }

  if (extraction.schemaKey === INVOICE_SCHEMA_KEY) {
    const effectiveByPath = new Map<string, unknown | null>();
    for (const wf of working) effectiveByPath.set(wf.path, effectiveValue(wf));
    const draft = buildNormalizedDraft(effectiveByPath);
    await upsertInvoiceProjection(tx, document.id, extraction.id, version, draft, approvedAt);
  }

  await tx.update(extractions).set({ version }).where(eq(extractions.id, extraction.id));
}

/** Optimistic-lock check: the client must be editing the current extraction. */
function assertFresh(
  extraction: typeof extractions.$inferSelect,
  expectedExtractionId: string | undefined,
  expectedVersion: number,
  verb: string,
): void {
  if (expectedExtractionId && expectedExtractionId !== extraction.id) {
    throw new AppError({
      code: ERROR_CODES.STALE_EXTRACTION_VERSION,
      status: 409,
      title: "Out of date",
      detail: `This document was reprocessed since you loaded it. Reload before ${verb}.`,
      meta: { currentExtractionId: extraction.id, currentVersion: extraction.version },
    });
  }
  if (extraction.version !== expectedVersion) {
    throw new AppError({
      code: ERROR_CODES.STALE_EXTRACTION_VERSION,
      status: 409,
      title: "Out of date",
      detail: `This extraction changed since you loaded it. Reload before ${verb}.`,
      meta: { currentVersion: extraction.version },
    });
  }
}

export async function saveExtraction(
  documentId: string,
  body: SaveExtractionRequest,
): Promise<ExtractionDetail> {
  const db = getDb();
  const context = await loadExtractionContext(documentId);
  assertFresh(context.extraction, body.expectedExtractionId, body.expectedVersion, "saving");

  const rows = context.rows;
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const working = rows.map(toWorking);
  const workingById = new Map(working.map((w) => [w.id, w]));

  const corrections: Array<{ fieldPath: string; action: string; from: unknown; to: unknown }> = [];

  for (const change of body.changes) {
    const row = rowById.get(change.fieldId);
    const wf = workingById.get(change.fieldId);
    if (!row || !wf) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION_FAILED,
        status: 400,
        title: "Unknown field",
        detail: `Field ${change.fieldId} is not part of this extraction.`,
      });
    }

    const before = effectiveValue(wf);
    switch (change.action) {
      case "confirm":
        wf.reviewState = "confirmed";
        break;
      case "correct": {
        if (change.value === undefined) {
          throw new AppError({ code: ERROR_CODES.VALIDATION_FAILED, status: 400, title: "Missing value", detail: `A value is required to correct ${row.label}.` });
        }
        wf.correctedValue = change.value;
        wf.reviewState = "corrected";
        break;
      }
      case "not_applicable":
        if (row.required) {
          throw new AppError({ code: ERROR_CODES.VALIDATION_FAILED, status: 400, title: "Required field", detail: `${row.label} is required and cannot be marked not applicable.` });
        }
        wf.reviewState = "not_applicable";
        wf.correctedValue = null;
        break;
      case "resolve_conflict": {
        const candidate = row.conflictCandidates.find((c) => c.id === change.candidateId);
        if (!candidate) {
          throw new AppError({ code: ERROR_CODES.VALIDATION_FAILED, status: 400, title: "Unknown candidate", detail: `Candidate ${change.candidateId ?? ""} is not valid for ${row.label}.` });
        }
        wf.correctedValue = candidate.value;
        wf.reviewState = "corrected";
        break;
      }
      default:
        throw new AppError({ code: ERROR_CODES.VALIDATION_FAILED, status: 400, title: "Unsupported action", detail: `Unsupported action for ${row.label}.` });
    }
    corrections.push({ fieldPath: row.path, action: change.action, from: before, to: effectiveValue(wf) });
  }

  const newVersion = context.extraction.version + 1;
  const wasApproved = context.document.reviewStatus === "approved";

  await db.transaction(async (tx) => {
    await persistDerived(tx, context.document, context.extraction, newVersion, working, rows, null);

    for (const c of corrections) {
      await tx.insert(fieldCorrections).values({
        extractionId: context.extraction.id,
        fieldPath: c.fieldPath,
        action: c.action,
        fromValue: (c.from ?? null) as object | null,
        toValue: (c.to ?? null) as object | null,
        extractionVersion: newVersion,
      });
    }
    await writeEvent(
      tx,
      documentId,
      wasApproved ? "reopened" : "corrected",
      `${corrections.length} field ${corrections.length === 1 ? "change" : "changes"} saved.`,
      context.extraction.id,
    );

    const ruleKeys = rulesForSchema(context.extraction.schemaKey);
    const validations = validateFields(working, ruleKeys);
    const blockers = approvalBlockers(working, validations);
    const reviewStatus = wasApproved ? "reopened" : docReviewStatus(blockers);

    await tx
      .update(documents)
      .set({ reviewStatus, approvedAt: wasApproved ? null : context.document.approvedAt, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  });

  return getExtractionDetail(documentId);
}

export async function approveDocument(
  documentId: string,
  body: ApproveRequest,
): Promise<ExtractionDetail> {
  const db = getDb();
  const context = await loadExtractionContext(documentId);
  assertFresh(context.extraction, body.expectedExtractionId, body.expectedVersion, "approving");

  const working = context.rows.map(toWorking);
  const ruleKeys = rulesForSchema(context.extraction.schemaKey);
  const validations = validateFields(working, ruleKeys);
  const blockers = approvalBlockers(working, validations);

  if (blockers.length > 0) {
    throw new AppError({
      code: ERROR_CODES.APPROVAL_BLOCKED,
      status: 422,
      title: "Cannot approve yet",
      detail: "Resolve the highlighted fields before approving.",
      fieldErrors: blockers.map((b) => ({ path: b.path ?? "", message: b.message })),
      meta: { blockers },
    });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(extractionFields)
      .set({ reviewState: "confirmed" })
      .where(and(eq(extractionFields.extractionId, context.extraction.id), eq(extractionFields.reviewState, "auto_accepted")));

    if (context.extraction.schemaKey === INVOICE_SCHEMA_KEY) {
      await tx
        .update(invoiceRecords)
        .set({ approvedAt: now, updatedAt: now })
        .where(eq(invoiceRecords.documentId, documentId));
    } else if (context.extraction.schemaKey) {
      await tx
        .insert(documentRecords)
        .values({
          documentId,
          extractionId: context.extraction.id,
          extractionVersion: context.extraction.version,
          schemaKey: context.extraction.schemaKey,
          schemaVersionId: context.extraction.schemaVersionId,
          data: dataForWorking(context.rows, working),
          approvedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: documentRecords.documentId,
          set: {
            extractionId: context.extraction.id,
            extractionVersion: context.extraction.version,
            schemaKey: context.extraction.schemaKey,
            schemaVersionId: context.extraction.schemaVersionId,
            data: dataForWorking(context.rows, working),
            approvedAt: now,
            updatedAt: now,
          },
        });
    }

    await tx
      .update(documents)
      .set({ reviewStatus: "approved", approvedAt: now, lastApprovedExtractionId: context.extraction.id, updatedAt: now })
      .where(eq(documents.id, documentId));

    await writeEvent(tx, documentId, "approved", "Document approved.", context.extraction.id);
  });

  return getExtractionDetail(documentId);
}
