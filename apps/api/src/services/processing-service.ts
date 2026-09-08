import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { ResolvedProfile } from "@invoice/fixtures";
import { getDb, type Database } from "../db/client.js";
import {
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
import { ERROR_CODES } from "@invoice/contracts";
import {
  computeNeedsAttention,
  docReviewStatus,
  effectiveValue,
  validateFields,
  type WorkingField,
} from "../lib/validation.js";
import { approvalBlockers } from "../lib/validation.js";
import { getProfileBySha } from "./profiles.js";

const ENGINE_VERSION = "fixture-engine.v1";
const LEASE_MS = 60_000;

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

/** Persist a fresh extraction (fields, sources, normalized draft) in one tx. */
async function commitExtraction(
  tx: Tx,
  document: DocumentRow,
  profile: ResolvedProfile,
  status: "succeeded" | "partial",
  presentSections: string[],
): Promise<void> {
  const extractionId = randomUUID();

  // First pass: give every field an id and assemble working models.
  const prepared = profile.fields.map((f, index) => ({
    id: randomUUID(),
    sortOrder: index,
    profile: f,
  }));

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

  const validations = validateFields(working);

  await tx.insert(extractions).values({
    id: extractionId,
    documentId: document.id,
    schemaVersion: profile.schemaVersion,
    engineVersion: ENGINE_VERSION,
    status,
    presentSections,
    pages: profile.pages,
    rawPayload: profile.fields as unknown as object,
    version: 1,
  });

  for (const p of prepared) {
    const wf = working.find((w) => w.id === p.id)!;
    const validation = validations.get(p.id) ?? { state: "not_checked" as const, issues: [] };
    const attention = computeNeedsAttention(wf, validation);
    const reviewState = attention ? "needs_review" : "auto_accepted";

    // Source-reference ids from fixtures (e.g. "vendorName#src0") are only
    // unique within a field, so scope them by the field's unique id to keep
    // them globally unique. Conflict candidates that point at a source
    // reference must be remapped to the same scoped id.
    const scopeRefId = (id: string): string => `${p.id}:${id}`;
    const conflictCandidates = p.profile.conflictCandidates.map((c) => ({
      ...c,
      sourceReferenceId: c.sourceReferenceId ? scopeRefId(c.sourceReferenceId) : null,
    }));

    await tx.insert(extractionFields).values({
      id: p.id,
      extractionId,
      path: p.profile.path,
      label: p.profile.label,
      fieldGroup: p.profile.group,
      type: p.profile.type,
      required: p.profile.required,
      material: p.profile.material,
      extractedValue: (p.profile.extractedValue ?? null) as object | null,
      correctedValue: null,
      confidenceScore: p.profile.confidenceScore,
      confidenceState: p.profile.confidenceState,
      confidenceReason: p.profile.confidenceReason,
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
        sourceText: ref.sourceText,
        candidateRank: ref.candidateRank,
      });
    }
  }

  // Normalized draft from effective (extracted) values.
  const effectiveByPath = new Map<string, unknown | null>();
  for (const wf of working) {
    effectiveByPath.set(wf.path, effectiveValue(wf));
  }
  const draft = buildNormalizedDraft(effectiveByPath);

  await tx.insert(invoiceRecords).values({
    documentId: document.id,
    extractionId,
    extractionVersion: 1,
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
    approvedAt: null,
  });

  for (const li of draft.lineItems) {
    await tx.insert(invoiceLineItems).values({
      invoiceDocumentId: document.id,
      position: li.position,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: li.lineTotal,
    });
  }

  // Compute the document review status from blockers.
  const blockers = approvalBlockers(working, validations);
  const reviewStatus = docReviewStatus(blockers);

  await tx
    .update(documents)
    .set({
      processingStatus: status,
      reviewStatus,
      processingPhase: null,
      failureCode: null,
      failureMessage: null,
      currentExtractionId: extractionId,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, document.id));
}

/**
 * Queue (or retry) processing for a document. Idempotent: rejects a second
 * active attempt and refuses to reprocess an approved document.
 */
export async function enqueueProcessing(documentId: string, retry: boolean): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) throw notFound("Document not found.");

    if (doc.reviewStatus === "approved") {
      throw new AppError({
        code: ERROR_CODES.ALREADY_APPROVED,
        status: 409,
        title: "Already approved",
        detail: "This document is approved. Reopen it before reprocessing.",
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

    await tx.insert(processingAttempts).values({
      documentId,
      attemptNumber: maxAttempt + 1,
      status: "queued",
      availableAt: new Date(),
    });

    await tx
      .update(documents)
      .set({ processingStatus: "queued", processingPhase: "Queued", failureCode: null, failureMessage: null, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
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
async function claimNextAttempt(): Promise<{ attemptId: string; documentId: string; attemptNumber: number } | null> {
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

    return { attemptId: attempt.id, documentId: attempt.documentId, attemptNumber: attempt.attemptNumber };
  });
}

/** Run a claimed attempt: simulate phases, then commit the outcome. */
async function runAttempt(claim: { attemptId: string; documentId: string; attemptNumber: number }): Promise<void> {
  const db = getDb();
  const env = loadEnv();
  const [doc] = await db.select().from(documents).where(eq(documents.id, claim.documentId)).limit(1);
  if (!doc) return;

  const profile = await getProfileBySha(doc.sha256);

  // Unknown document: no profile. Honest failure, preserve the upload.
  if (!profile) {
    await db.transaction(async (tx) => {
      await tx
        .update(processingAttempts)
        .set({
          status: "failed",
          phase: null,
          errorCode: ERROR_CODES.UNSUPPORTED_FILE,
          errorMessage: "This document is not one of the built-in samples. The demo extractor only supports the included fixtures.",
          finishedAt: new Date(),
          leaseUntil: null,
        })
        .where(eq(processingAttempts.id, claim.attemptId));
      await tx
        .update(documents)
        .set({
          processingStatus: "failed",
          processingPhase: null,
          failureCode: "UNSUPPORTED_FIXTURE",
          failureMessage: "The demo extractor only supports the included sample invoices. Try a sample to see the full flow.",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));
    });
    return;
  }

  const attemptSpec =
    profile.processing.attempts[claim.attemptNumber - 1] ??
    profile.processing.attempts[profile.processing.attempts.length - 1]!;

  // Simulate processing phases with short, visible delays.
  for (const phase of profile.processing.phases) {
    await db
      .update(processingAttempts)
      .set({ phase, leaseUntil: new Date(Date.now() + LEASE_MS) })
      .where(eq(processingAttempts.id, claim.attemptId));
    await db.update(documents).set({ processingPhase: phase, updatedAt: new Date() }).where(eq(documents.id, doc.id));
    await sleep(env.PROCESSING_DELAY_MS);
    // Stop early if this attempt fails during a phase.
    if (attemptSpec.outcome === "failed") break;
  }

  if (attemptSpec.outcome === "failed") {
    await db.transaction(async (tx) => {
      await tx
        .update(processingAttempts)
        .set({
          status: "failed",
          phase: null,
          errorCode: attemptSpec.code,
          errorMessage: attemptSpec.message,
          finishedAt: new Date(),
          leaseUntil: null,
        })
        .where(eq(processingAttempts.id, claim.attemptId));
      await tx
        .update(documents)
        .set({
          processingStatus: "failed",
          processingPhase: null,
          failureCode: attemptSpec.code,
          failureMessage: attemptSpec.message,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));
    });
    return;
  }

  const presentSections =
    attemptSpec.outcome === "partial"
      ? ["identity", "dates", "amounts", "lineItems", "metadata"].filter(
          (s) => !attemptSpec.missingSections.includes(s as never),
        )
      : ["identity", "dates", "amounts", "lineItems", "metadata"];

  await db.transaction(async (tx) => {
    // Clear any prior extraction/records so a retry is clean.
    await tx.delete(invoiceRecords).where(eq(invoiceRecords.documentId, doc.id));
    await tx.delete(extractions).where(eq(extractions.documentId, doc.id));

    await commitExtraction(tx, doc, profile, attemptSpec.outcome === "partial" ? "partial" : "succeeded", presentSections);

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
