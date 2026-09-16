import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { ResolvedProfile } from "@invoice/fixtures";
import { analyze, extractStructural, ParseError, parseDocument, PARSER_VERSION, type CanonicalParse } from "@invoice/extraction";
import { getDb, type Database } from "../db/client.js";
import {
  documentFiles,
  documentParses,
  documents,
  extractionFields,
  extractions,
  invoiceLineItems,
  invoiceRecords,
  processingAttempts,
  sourceReferences,
  type DocumentRow,
} from "../db/schema.js";
import { loadEnv } from "../env.js";
import { AppError, notFound } from "../lib/errors.js";
import { ERROR_CODES, type ProcessMode } from "@invoice/contracts";
import {
  approvalBlockers,
  computeNeedsAttention,
  docReviewStatus,
  effectiveValue,
  validateFields,
  type WorkingField,
} from "../lib/validation.js";
import { getProfileBySha } from "./profiles.js";
import { commitGenericExtraction, typedIndexColumns, writeEvent } from "./extraction-commit.js";
import { runGenericExtraction } from "./extractor-registry.js";
import {
  INVOICE_RULE_KEYS,
  INVOICE_SCHEMA_KEY,
  INVOICE_SCHEMA_NAME,
  buildInvoiceSchemaTree,
  ensureBuiltInSchemas,
  findBestPublishedSchemaMatch,
  getInvoiceSchemaVersionId,
  getSchemaTreeByVersionId,
  invoiceSchemaFieldKey,
} from "./schema-service.js";

const ENGINE_VERSION = "fixture-engine.v1";
const LEASE_MS = 60_000;
const INVOICE_SECTIONS = ["identity", "dates", "amounts", "lineItems", "metadata"];

export interface EnqueueProcessingOptions {
  mode?: ProcessMode;
  retry?: boolean;
  schemaVersionId?: string;
  forceReparse?: boolean;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizedVendor(name: string | null): string | null {
  if (!name) return null;
  return name.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

interface NormalizedDraft {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  paymentTerms: string | null;
  lineItems: Array<{
    position: number;
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    lineTotal: string | null;
  }>;
}

/** Derive the normalized record from a set of {path -> effective value}. */
export function buildNormalizedDraft(effectiveByPath: Map<string, unknown | null>): NormalizedDraft {
  const get = (path: string): string | null => stringOrNull(effectiveByPath.get(path) ?? null);

  const indexes = new Set<number>();
  for (const key of effectiveByPath.keys()) {
    const m = /^lineItems\[(\d+)\]\./u.exec(key);
    if (m) indexes.add(Number(m[1]));
  }
  const lineItems = [...indexes]
    .sort((a, b) => a - b)
    .map((idx) => ({
      position: idx,
      description: get(`lineItems[${idx}].description`),
      quantity: get(`lineItems[${idx}].quantity`),
      unitPrice: get(`lineItems[${idx}].unitPrice`),
      lineTotal: get(`lineItems[${idx}].lineTotal`),
    }));

  return {
    vendorName: get("vendorName"),
    invoiceNumber: get("invoiceNumber"),
    invoiceDate: get("invoiceDate"),
    dueDate: get("dueDate"),
    currency: get("currency"),
    subtotal: get("subtotal"),
    tax: get("tax"),
    total: get("total"),
    paymentTerms: get("paymentTerms"),
    lineItems,
  };
}

/** Upsert the trusted invoice projection (append-only extraction history keeps
 * the projection as a single current row keyed by document). */
export async function upsertInvoiceProjection(
  tx: Tx,
  documentId: string,
  extractionId: string,
  version: number,
  draft: NormalizedDraft,
  approvedAt: Date | null,
): Promise<void> {
  await tx
    .insert(invoiceRecords)
    .values({
      documentId,
      extractionId,
      extractionVersion: version,
      vendorName: draft.vendorName,
      vendorNameNormalized: normalizedVendor(draft.vendorName),
      invoiceNumber: draft.invoiceNumber,
      invoiceDate: draft.invoiceDate,
      dueDate: draft.dueDate,
      currency: draft.currency,
      subtotal: draft.subtotal,
      tax: draft.tax,
      total: draft.total,
      paymentTerms: draft.paymentTerms,
      approvedAt,
    })
    .onConflictDoUpdate({
      target: invoiceRecords.documentId,
      set: {
        extractionId,
        extractionVersion: version,
        vendorName: draft.vendorName,
        vendorNameNormalized: normalizedVendor(draft.vendorName),
        invoiceNumber: draft.invoiceNumber,
        invoiceDate: draft.invoiceDate,
        dueDate: draft.dueDate,
        currency: draft.currency,
        subtotal: draft.subtotal,
        tax: draft.tax,
        total: draft.total,
        paymentTerms: draft.paymentTerms,
        approvedAt,
        updatedAt: new Date(),
      },
    });

  await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceDocumentId, documentId));
  for (const li of draft.lineItems) {
    await tx.insert(invoiceLineItems).values({
      invoiceDocumentId: documentId,
      position: li.position,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: li.lineTotal,
    });
  }
}

/** Persist a fresh invoice (fixture) extraction. Append-only: never deletes
 * prior extractions; repoints the document to the new extraction. */
async function commitFixtureExtraction(
  tx: Tx,
  document: DocumentRow,
  profile: ResolvedProfile,
  status: "succeeded" | "partial",
  presentSections: string[],
  statusNote: string | null,
  invoiceVersionId: string | null,
): Promise<void> {
  const extractionId = randomUUID();

  const prepared = profile.fields.map((f, index) => ({ id: randomUUID(), sortOrder: index, profile: f }));

  const working: WorkingField[] = prepared.map((p) => ({
    id: p.id,
    path: p.profile.path,
    group: p.profile.group,
    type: p.profile.type,
    required: p.profile.required,
    material: p.profile.material,
    label: p.profile.label,
    extractedValue: p.profile.extractedValue,
    correctedValue: null,
    reviewState: "needs_review",
    confidenceState: p.profile.confidenceState,
  }));

  const validations = validateFields(working, [...INVOICE_RULE_KEYS]);

  await tx.insert(extractions).values({
    id: extractionId,
    documentId: document.id,
    schemaVersion: profile.schemaVersion,
    schemaKey: INVOICE_SCHEMA_KEY,
    schemaVersionId: invoiceVersionId,
    parseId: null,
    parentExtractionId: document.currentExtractionId,
    engineVersion: ENGINE_VERSION,
    extractorKey: "fixture",
    providerModel: null,
    sourceKind: "pdf",
    status,
    statusNote,
    presentSections,
    pages: profile.pages,
    rawPayload: { fields: profile.fields, schema: buildInvoiceSchemaTree() } as unknown as object,
    version: 1,
  });

  for (const p of prepared) {
    const wf = working.find((w) => w.id === p.id)!;
    const validation = validations.get(p.id) ?? { state: "not_checked" as const, issues: [] };
    const attention = computeNeedsAttention(wf, validation);
    const reviewState = attention ? "needs_review" : "auto_accepted";

    const scopeRefId = (id: string): string => `${p.id}:${id}`;
    const conflictCandidates = p.profile.conflictCandidates.map((c) => ({
      ...c,
      sourceReferenceId: c.sourceReferenceId ? scopeRefId(c.sourceReferenceId) : null,
    }));

    const typed = typedIndexColumns(p.profile.type, p.profile.extractedValue);

    await tx.insert(extractionFields).values({
      id: p.id,
      extractionId,
      path: p.profile.path,
      schemaFieldKey: invoiceSchemaFieldKey(p.profile.path),
      label: p.profile.label,
      fieldGroup: p.profile.group,
      type: p.profile.type,
      nodeKind: "scalar",
      required: p.profile.required,
      material: p.profile.material,
      presenceState: p.profile.extractedValue == null ? "not_found" : "present",
      valueOrigin: p.profile.confidenceState === "inferred" ? "inferred" : "extracted",
      extractedValue: (p.profile.extractedValue ?? null) as object | null,
      correctedValue: null,
      valueText: typed.valueText,
      valueNumeric: typed.valueNumeric,
      valueDate: typed.valueDate,
      valueBoolean: typed.valueBoolean,
      confidenceScore: p.profile.confidenceScore,
      confidenceState: p.profile.confidenceState,
      confidenceReason: p.profile.confidenceReason,
      parseConfidence: 0.95,
      validationState: validation.state,
      validationIssues: validation.issues,
      reviewState,
      needsAttention: attention,
      conflictCandidates,
      sortOrder: p.sortOrder,
    });

    for (const ref of p.profile.sourceReferences) {
      await tx.insert(sourceReferences).values({
        id: scopeRefId(ref.id),
        fieldId: p.id,
        page: ref.page,
        box: ref.box,
        offsetStart: null,
        offsetEnd: null,
        groundingStatus: "grounded",
        regions: [],
        sourceText: ref.sourceText,
        candidateRank: ref.candidateRank,
      });
    }
  }

  const effectiveByPath = new Map<string, unknown | null>();
  for (const wf of working) effectiveByPath.set(wf.path, effectiveValue(wf));
  const draft = buildNormalizedDraft(effectiveByPath);
  await upsertInvoiceProjection(tx, document.id, extractionId, 1, draft, null);

  const blockers = approvalBlockers(working, validations);
  const reviewStatus = docReviewStatus(blockers);

  await tx
    .update(documents)
    .set({
      documentType: INVOICE_SCHEMA_KEY,
      schemaName: INVOICE_SCHEMA_NAME,
      sourceKind: "pdf",
      processingStatus: status,
      reviewStatus,
      processingPhase: null,
      failureCode: null,
      failureMessage: null,
      currentExtractionId: extractionId,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, document.id));

  await writeEvent(tx, document.id, "extraction_created", "Extracted invoice fields.", extractionId);
  await writeEvent(tx, document.id, "extraction_promoted", "Promoted extraction to current.", extractionId);
}

/**
 * Queue processing for a document. Legacy callers may pass a boolean retry
 * flag; new callers can choose `mode: "reextract"` and an optional schema.
 */
export async function enqueueProcessing(
  documentId: string,
  options: boolean | EnqueueProcessingOptions,
): Promise<void> {
  const opts: EnqueueProcessingOptions = typeof options === "boolean" ? { retry: options } : options;
  const mode: ProcessMode = opts.mode ?? (opts.retry ? "retry" : "initial");
  const retry = opts.retry ?? mode !== "initial";
  const db = getDb();
  await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) throw notFound("Document not found.");

    if (doc.reviewStatus === "approved" && mode !== "reextract") {
      throw new AppError({
        code: ERROR_CODES.ALREADY_APPROVED,
        status: 409,
        title: "Already approved",
        detail: "This document is approved. Use re-extract to preserve the approved snapshot while producing a new extraction.",
      });
    }

    const active = await tx
      .select({ id: processingAttempts.id })
      .from(processingAttempts)
      .where(
        and(
          eq(processingAttempts.documentId, documentId),
          inArray(processingAttempts.status, ["queued", "processing"]),
        ),
      )
      .limit(1);
    if (active.length > 0) {
      throw new AppError({
        code: ERROR_CODES.PROCESSING_IN_PROGRESS,
        status: 409,
        title: "Already processing",
        detail: "A processing attempt is already in progress for this document.",
      });
    }

    if (doc.processingStatus === "succeeded" && !retry) {
      throw new AppError({
        code: ERROR_CODES.PROCESSING_IN_PROGRESS,
        status: 409,
        title: "Already processed",
        detail: "This document already has a completed extraction.",
      });
    }

    const maxRows = await tx
      .select({ maxAttempt: sql<number>`coalesce(max(${processingAttempts.attemptNumber}), 0)` })
      .from(processingAttempts)
      .where(eq(processingAttempts.documentId, documentId));
    const maxAttempt = Number(maxRows[0]?.maxAttempt ?? 0);

    if (maxAttempt === 0) {
      await writeEvent(tx, documentId, "uploaded", "Document uploaded.");
    }

    await tx.insert(processingAttempts).values({
      documentId,
      attemptNumber: maxAttempt + 1,
      status: "queued",
      mode,
      schemaVersionId: opts.schemaVersionId ?? null,
      forceReparse: opts.forceReparse ?? false,
      availableAt: new Date(),
    });

    await tx
      .update(documents)
      .set({ processingStatus: "queued", processingPhase: "Queued", failureCode: null, failureMessage: null, updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    if (mode === "reextract") {
      await writeEvent(tx, documentId, "reprocessed", "Queued document for re-extraction.");
    }
  });
}

/** Reset attempts whose lease expired (e.g. after a server crash). */
export async function recoverStuckAttempts(): Promise<void> {
  const db = getDb();
  await db
    .update(processingAttempts)
    .set({ status: "queued", leaseUntil: null, startedAt: null })
    .where(and(eq(processingAttempts.status, "processing"), lte(processingAttempts.leaseUntil, new Date())));
}

/** Claim the next due attempt transactionally; returns it or null. */
async function claimNextAttempt(): Promise<{
  attemptId: string;
  documentId: string;
  attemptNumber: number;
  mode: ProcessMode;
  schemaVersionId: string | null;
  forceReparse: boolean;
} | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(processingAttempts)
      .where(
        and(
          eq(processingAttempts.status, "queued"),
          lte(processingAttempts.availableAt, new Date()),
        ),
      )
      .orderBy(asc(processingAttempts.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!attempt) return null;

    await tx
      .update(processingAttempts)
      .set({ status: "processing", startedAt: new Date(), leaseUntil: new Date(Date.now() + LEASE_MS), phase: "Starting" })
      .where(eq(processingAttempts.id, attempt.id));

    await tx
      .update(documents)
      .set({ processingStatus: "processing", processingStartedAt: new Date(), processingPhase: "Starting", updatedAt: new Date() })
      .where(eq(documents.id, attempt.documentId));

    return {
      attemptId: attempt.id,
      documentId: attempt.documentId,
      attemptNumber: attempt.attemptNumber,
      mode: (attempt.mode as ProcessMode) ?? "initial",
      schemaVersionId: attempt.schemaVersionId,
      forceReparse: attempt.forceReparse,
    };
  });
}

/** Fail an attempt + document with a taxonomy code, preserving the upload. */
async function failAttempt(
  attemptId: string,
  document: DocumentRow,
  code: string,
  message: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(processingAttempts)
      .set({ status: "failed", phase: null, errorCode: code, errorMessage: message, finishedAt: new Date(), leaseUntil: null })
      .where(eq(processingAttempts.id, attemptId));
    await tx
      .update(documents)
      .set({ processingStatus: "failed", processingPhase: null, failureCode: code, failureMessage: message, updatedAt: new Date() })
      .where(eq(documents.id, document.id));
  });
}

async function latestCanonicalParse(documentId: string): Promise<{ id: string; parse: CanonicalParse } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(documentParses)
    .where(eq(documentParses.documentId, documentId))
    .orderBy(desc(documentParses.createdAt))
    .limit(1);
  if (!row) return null;
  if (row.parserVersion !== PARSER_VERSION) return null;
  const sourceKind = row.sourceKind === "pdf" ? "pdf" : "text";
  const parse = analyze(row.text, {
    sourceKind,
    pages: row.pages,
  });
  return { id: row.id, parse };
}

/** Parse + extract a non-fixture document through the extractor registry. */
async function runGenericAttempt(
  claim: { attemptId: string; schemaVersionId: string | null; forceReparse: boolean },
  doc: DocumentRow,
): Promise<void> {
  const db = getDb();
  const env = loadEnv();

  await db
    .update(processingAttempts)
    .set({ phase: "Parsing document", leaseUntil: new Date(Date.now() + LEASE_MS) })
    .where(eq(processingAttempts.id, claim.attemptId));
  await db.update(documents).set({ processingPhase: "Parsing document", updatedAt: new Date() }).where(eq(documents.id, doc.id));

  let parse: CanonicalParse;
  let parseId: string | null = null;
  try {
    const reused = claim.forceReparse ? null : await latestCanonicalParse(doc.id);
    if (reused) {
      parse = reused.parse;
      parseId = reused.id;
    } else {
      const [file] = await db
        .select({ content: documentFiles.content })
        .from(documentFiles)
        .where(eq(documentFiles.documentId, doc.id))
        .limit(1);
      if (!file) {
        await failAttempt(claim.attemptId, doc, ERROR_CODES.PARSE_FAILED, "The uploaded file could not be found.");
        return;
      }
      parse = await parseDocument({ bytes: file.content, filename: doc.originalFilename, mime: doc.mimeType });
    }
  } catch (error) {
    if (error instanceof ParseError) {
      const message =
        error.code === "OCR_REQUIRED"
          ? "This PDF has no readable text layer (it looks scanned). OCR is not available in this demo."
          : error.message;
      await failAttempt(claim.attemptId, doc, error.code, message);
      return;
    }
    throw error;
  }

  await db
    .update(processingAttempts)
    .set({ phase: "Extracting fields", leaseUntil: new Date(Date.now() + LEASE_MS) })
    .where(eq(processingAttempts.id, claim.attemptId));
  await db.update(documents).set({ processingPhase: "Extracting fields", updatedAt: new Date() }).where(eq(documents.id, doc.id));
  await sleep(Math.min(env.PROCESSING_DELAY_MS, 400));

  let targetSchema = claim.schemaVersionId ? await getSchemaTreeByVersionId(claim.schemaVersionId) : null;
  let targetSchemaVersionId = claim.schemaVersionId;
  let schemaMatchNote: string | null = null;
  if (!targetSchema) {
    const preflight = extractStructural(parse);
    const match = await findBestPublishedSchemaMatch(preflight.schema);
    if (match) {
      targetSchema = match.schema;
      targetSchemaVersionId = match.schemaVersionId;
      schemaMatchNote = `Matched published schema "${match.schema.name}" (${Math.round(match.score * 100)}% overlap score).`;
    }
  }
  const extracted = await runGenericExtraction(parse, targetSchema);
  const result = schemaMatchNote && !extracted.statusNote
    ? { ...extracted, statusNote: schemaMatchNote }
    : extracted;
  const contentHash = createHash("sha256").update(parse.text).digest("hex");

  await db.transaction(async (tx) => {
    if (!parseId) {
      const [parseRow] = await tx
        .insert(documentParses)
        .values({
          documentId: doc.id,
          sourceKind: parse.sourceKind,
          text: parse.text,
          blocks: parse.blocks,
          pages: parse.pages,
          parserVersion: parse.parserVersion,
          contentHash,
        })
        .returning({ id: documentParses.id });
      parseId = parseRow!.id;
    }

    const extractionId = await commitGenericExtraction(tx, doc, result, {
      parseId,
      sourceKind: parse.sourceKind,
      providerModel: result.providerModel,
      pages: parse.pages,
      schemaVersionId: targetSchemaVersionId,
    });
    if (schemaMatchNote) {
      await writeEvent(tx, doc.id, "schema_reassigned", schemaMatchNote, extractionId);
    }

    const attemptStatus = result.status === "degraded" ? "partial" : result.status === "partial" ? "partial" : "succeeded";
    await tx
      .update(processingAttempts)
      .set({
        status: attemptStatus,
        phase: null,
        errorMessage: result.statusNote,
        finishedAt: new Date(),
        leaseUntil: null,
      })
      .where(eq(processingAttempts.id, claim.attemptId));
  });
}

/** Run a claimed attempt: fixtures simulate phases; others parse + extract. */
async function runAttempt(claim: {
  attemptId: string;
  documentId: string;
  attemptNumber: number;
  mode: ProcessMode;
  schemaVersionId: string | null;
  forceReparse: boolean;
}): Promise<void> {
  const db = getDb();
  const env = loadEnv();
  const [doc] = await db.select().from(documents).where(eq(documents.id, claim.documentId)).limit(1);
  if (!doc) return;

  const profile = await getProfileBySha(doc.sha256);

  // Non-fixture documents flow through the parse + extractor registry.
  if (!profile) {
    await runGenericAttempt(claim, doc);
    return;
  }

  await ensureBuiltInSchemas();
  const invoiceVersionId = await getInvoiceSchemaVersionId();

  const attemptSpec =
    profile.processing.attempts[claim.attemptNumber - 1] ??
    profile.processing.attempts[profile.processing.attempts.length - 1]!;

  for (const phase of profile.processing.phases) {
    await db
      .update(processingAttempts)
      .set({ phase, leaseUntil: new Date(Date.now() + LEASE_MS) })
      .where(eq(processingAttempts.id, claim.attemptId));
    await db.update(documents).set({ processingPhase: phase, updatedAt: new Date() }).where(eq(documents.id, doc.id));
    await sleep(env.PROCESSING_DELAY_MS);
    if (attemptSpec.outcome === "failed") break;
  }

  if (attemptSpec.outcome === "failed") {
    await failAttempt(claim.attemptId, doc, attemptSpec.code, attemptSpec.message);
    return;
  }

  const presentSections =
    attemptSpec.outcome === "partial"
      ? INVOICE_SECTIONS.filter((s) => !attemptSpec.missingSections.includes(s as never))
      : INVOICE_SECTIONS;
  const statusNote = attemptSpec.outcome === "partial" ? attemptSpec.note : null;

  await db.transaction(async (tx) => {
    await commitFixtureExtraction(
      tx,
      doc,
      profile,
      attemptSpec.outcome === "partial" ? "partial" : "succeeded",
      presentSections,
      statusNote,
      invoiceVersionId,
    );

    await tx
      .update(processingAttempts)
      .set({
        status: attemptSpec.outcome === "partial" ? "partial" : "succeeded",
        phase: null,
        errorMessage: attemptSpec.outcome === "partial" ? attemptSpec.note : null,
        finishedAt: new Date(),
        leaseUntil: null,
      })
      .where(eq(processingAttempts.id, claim.attemptId));
  });
}

/** Drain all currently-due attempts. Called by the worker loop. */
export async function processDueAttempts(): Promise<void> {
  for (;;) {
    const claim = await claimNextAttempt();
    if (!claim) break;
    try {
      await runAttempt(claim);
    } catch (error) {
      const db = getDb();
      await db
        .update(processingAttempts)
        .set({
          status: "failed",
          errorCode: "PROCESSING_ERROR",
          errorMessage: "The extractor hit an unexpected error. This is safe to retry.",
          finishedAt: new Date(),
          leaseUntil: null,
        })
        .where(eq(processingAttempts.id, claim.attemptId));
      await db
        .update(documents)
        .set({ processingStatus: "failed", processingPhase: null, failureCode: "PROCESSING_ERROR", failureMessage: "The extractor hit an unexpected error. This is safe to retry.", updatedAt: new Date() })
        .where(eq(documents.id, claim.documentId));
      // eslint-disable-next-line no-console
      console.error("processing attempt failed", error);
    }
  }
}
