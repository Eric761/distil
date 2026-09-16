import { and, count, eq } from "drizzle-orm";
import { DEMO_SEED_DOCUMENT_COUNT } from "@invoice/fixtures";
import { INVOICE_TYPE } from "@invoice/contracts";
import { closeDb, getDb } from "./client.js";
import { loadEnv } from "../env.js";
import { documentRecords, documents, extractionFields, extractions, invoiceRecords, processingAttempts } from "./schema.js";
import { NON_INVOICE_DEMOS } from "./demo-documents.js";
import { ingestSample, ingestUpload } from "../services/document-service.js";
import { enqueueProcessing, processDueAttempts } from "../services/processing-service.js";
import { getProfiles } from "../services/profiles.js";
import { ensureBuiltInSchemas } from "../services/schema-service.js";
import { deriveData } from "../services/extraction-commit.js";

type HeldProcessingState =
  | { processingStatus: "uploaded"; reviewStatus: "not_ready"; phase: null }
  | { processingStatus: "queued"; reviewStatus: "not_ready"; phase: string }
  | { processingStatus: "processing"; reviewStatus: "not_ready"; phase: string };

const HELD_PROCESSING_STATES = {
  "prismworks-uploaded": { processingStatus: "uploaded", reviewStatus: "not_ready", phase: null },
} satisfies Record<string, HeldProcessingState>;

/** Approved records — available in Explore and export. */
const APPROVED_FIXTURES = [
  "acme-clean",
  "orbital-market",
] as const;

/** Previously approved, then reopened for re-review. */
const REOPENED_FIXTURES = ["northstar-terminology"] as const;

/** Extraction failed — retryable from the document list. */
const FAILED_FIXTURES = ["novafoods-failed"] as const;

/** Partial extraction — retry may recover more fields. */
const PARTIAL_RETRY_FIXTURES = ["redbrick-partial"] as const;
const DEMO_TARGET_COUNT = DEMO_SEED_DOCUMENT_COUNT + NON_INVOICE_DEMOS.length;

const FIRST_PAGE_ORDER = [
  "acme-clean",
  "generic-project-brief",
  "generic-support-tickets",
  "generic-service-summary",
  "generic-resume",
  "atlas-conflict",
  "generic-release-plan",
  "generic-product-catalog",
  "generic-low-structure-note",
  "novafoods-failed",
] as const;

async function markApproved(documentId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc?.currentExtractionId) return;
  const extractionId = doc.currentExtractionId;

  await db.transaction(async (tx) => {
    const [extraction] = await tx
      .select()
      .from(extractions)
      .where(eq(extractions.id, extractionId))
      .limit(1);
    const fields = await tx
      .select()
      .from(extractionFields)
      .where(eq(extractionFields.extractionId, extractionId));

    await tx
      .update(extractionFields)
      .set({ reviewState: "confirmed", needsAttention: false })
      .where(eq(extractionFields.extractionId, extractionId));
    if (doc.documentType === INVOICE_TYPE) {
      await tx
        .update(invoiceRecords)
        .set({ approvedAt: now, updatedAt: now })
        .where(eq(invoiceRecords.documentId, documentId));
    } else if (extraction?.schemaKey) {
      const schemaKey = extraction.schemaKey;
      await tx
        .insert(documentRecords)
        .values({
          documentId,
          extractionId,
          extractionVersion: extraction.version,
          schemaKey,
          schemaVersionId: extraction.schemaVersionId,
          data: deriveData(fields.map((field) => ({
            path: field.path,
            nodeKind: field.nodeKind,
            value: field.correctedValue ?? field.extractedValue ?? null,
          }))),
          approvedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: documentRecords.documentId,
          set: {
            extractionId,
            extractionVersion: extraction.version,
            schemaKey,
            schemaVersionId: extraction.schemaVersionId,
            data: deriveData(fields.map((field) => ({
              path: field.path,
              nodeKind: field.nodeKind,
              value: field.correctedValue ?? field.extractedValue ?? null,
            }))),
            approvedAt: now,
            updatedAt: now,
          },
        });
    }
    await tx
      .update(documents)
      .set({ reviewStatus: "approved", approvedAt: now, lastApprovedExtractionId: doc.currentExtractionId, updatedAt: now })
      .where(eq(documents.id, documentId));
  });
}

async function markReopened(documentId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc?.currentExtractionId) return;

  await markApproved(documentId);
  await db
    .update(documents)
    .set({ reviewStatus: "reopened", approvedAt: null, updatedAt: now })
    .where(eq(documents.id, documentId));
}

async function markFailed(documentId: string, errorCode = "LOW_QUALITY_SCAN"): Promise<void> {
  const db = getDb();
  const now = new Date();
  const message =
    errorCode === "EXTRACTOR_TIMEOUT"
      ? "The extractor timed out reading the document. This is safe to retry."
      : errorCode === "GENERIC_EXTRACTION_FAILED"
        ? "The generic extractor could not produce a reliable schema from this document. This is safe to retry."
      : "The uploaded scan is too blurry to extract confidently. Upload a clearer copy or retry.";

  await db.transaction(async (tx) => {
    await tx
      .delete(processingAttempts)
      .where(and(eq(processingAttempts.documentId, documentId), eq(processingAttempts.attemptNumber, 2)));
    await tx.insert(processingAttempts).values({
      documentId,
      attemptNumber: 2,
      status: "failed",
      phase: null,
      errorCode,
      errorMessage: message,
      availableAt: now,
      startedAt: now,
      finishedAt: now,
    });
    await tx
      .update(documents)
      .set({
        processingStatus: "failed",
        reviewStatus: "not_ready",
        processingPhase: null,
        failureCode: errorCode,
        failureMessage: message,
        updatedAt: now,
      })
      .where(eq(documents.id, documentId));
  });
}

async function applyDemoState(
  documentId: string,
  state: (typeof NON_INVOICE_DEMOS)[number]["seedState"] | undefined,
): Promise<void> {
  if (!state) return;
  if (state === "approved") {
    await markApproved(documentId);
    return;
  }
  if (state === "reopened") {
    await markReopened(documentId);
    return;
  }
  if (state === "failed") {
    await markFailed(documentId, "GENERIC_EXTRACTION_FAILED");
    return;
  }
  if (state === "uploaded") {
    await holdProcessingState(documentId, { processingStatus: "uploaded", reviewStatus: "not_ready", phase: null });
    return;
  }
  if (state === "queued") {
    await holdProcessingState(documentId, { processingStatus: "queued", reviewStatus: "not_ready", phase: "Queued" });
    return;
  }
  await holdProcessingState(documentId, {
    processingStatus: "processing",
    reviewStatus: "not_ready",
    phase: "Inferring schema",
  });
}

async function applyFirstPageOrder(
  invoiceIds: Map<string, string>,
  demoIds: Map<string, string>,
): Promise<void> {
  const db = getDb();
  const base = Date.now();
  for (let index = 0; index < FIRST_PAGE_ORDER.length; index += 1) {
    const key = FIRST_PAGE_ORDER[index]!;
    const documentId = invoiceIds.get(key) ?? demoIds.get(key);
    if (!documentId) continue;
    await db
      .update(documents)
      .set({ updatedAt: new Date(base - index * 60_000) })
      .where(eq(documents.id, documentId));
  }
}

async function holdProcessingState(
  documentId: string,
  state: HeldProcessingState,
): Promise<void> {
  const db = getDb();
  const availableAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .delete(processingAttempts)
      .where(and(eq(processingAttempts.documentId, documentId), eq(processingAttempts.attemptNumber, 2)));

    await tx
      .update(documents)
      .set({
        processingStatus: state.processingStatus,
        reviewStatus: state.reviewStatus,
        processingPhase: state.phase,
        failureCode: null,
        failureMessage: null,
        updatedAt: now,
      })
      .where(eq(documents.id, documentId));

    if (state.processingStatus === "queued") {
      await tx.insert(processingAttempts).values({
        documentId,
        attemptNumber: 2,
        status: "queued",
        phase: "Queued",
        availableAt,
      });
    }

    if (state.processingStatus === "processing") {
      await tx.insert(processingAttempts).values({
        documentId,
        attemptNumber: 2,
        status: "processing",
        phase: state.phase,
        availableAt,
        leaseUntil: availableAt,
        startedAt: now,
      });
    }
  });
}

async function getDocumentCount(): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ value: count() }).from(documents);
  return row?.value ?? 0;
}

export async function runSeed(options?: { closeAfter?: boolean }): Promise<void> {
  const env = loadEnv();
  if (!env.SEED_DEMO_DATA) {
    // eslint-disable-next-line no-console
    console.log("SEED_DEMO_DATA is false; skipping demo seed.");
    if (options?.closeAfter) {
      await closeDb();
    }
    return;
  }

  const existingCount = await getDocumentCount();
  if (!env.SEED_FORCE && existingCount >= DEMO_TARGET_COUNT) {
    // eslint-disable-next-line no-console
    console.log(
      `seed skipped — library has ${existingCount} documents (demo target: ${DEMO_TARGET_COUNT}). Set SEED_FORCE=true to re-run.`,
    );
    if (options?.closeAfter) {
      await closeDb();
    }
    return;
  }

  await ensureBuiltInSchemas();

  const profiles = await getProfiles();
  const seededIds = new Map<string, string>();
  for (const profile of profiles) {
    const result = await ingestSample(profile.fixtureId);
    seededIds.set(profile.fixtureId, result.document.id);
    // eslint-disable-next-line no-console
    console.log(`${result.duplicate ? "exists" : "seeded"}: ${profile.descriptor.title}`);
  }

  // Non-invoice demos: real text-format files that flow through the generic
  // parse/classify/infer/extract pipeline (no OpenAI required).
  const demoIds = new Map<string, string>();
  for (const demo of NON_INVOICE_DEMOS) {
    const result = await ingestUpload({
      filename: demo.filename,
      mimeType: demo.mimeType,
      bytes: Buffer.from(demo.content, "utf8"),
      autoProcess: true,
    });
    demoIds.set(demo.id, result.document.id);
    // eslint-disable-next-line no-console
    console.log(`${result.duplicate ? "exists" : "seeded"}: ${demo.filename}`);
  }

  // eslint-disable-next-line no-console
  console.log("processing seeded documents...");
  await processDueAttempts();

  for (const demo of NON_INVOICE_DEMOS) {
    const documentId = demoIds.get(demo.id);
    if (documentId) await applyDemoState(documentId, demo.seedState ?? (demo.approve ? "approved" : undefined));
  }

  for (const fixtureId of PARTIAL_RETRY_FIXTURES) {
    const documentId = seededIds.get(fixtureId);
    if (documentId) {
      await enqueueProcessing(documentId, true);
      await processDueAttempts();
    }
  }

  for (const fixtureId of APPROVED_FIXTURES) {
    const documentId = seededIds.get(fixtureId);
    if (documentId) await markApproved(documentId);
  }

  for (const fixtureId of REOPENED_FIXTURES) {
    const documentId = seededIds.get(fixtureId);
    if (documentId) await markReopened(documentId);
  }

  for (const fixtureId of FAILED_FIXTURES) {
    const documentId = seededIds.get(fixtureId);
    if (documentId) await markFailed(documentId, "LOW_QUALITY_SCAN");
  }

  for (const [fixtureId, state] of Object.entries(HELD_PROCESSING_STATES)) {
    const documentId = seededIds.get(fixtureId);
    if (documentId) await holdProcessingState(documentId, state);
  }

  await applyFirstPageOrder(seededIds, demoIds);

  // eslint-disable-next-line no-console
  console.log(`seed complete — ${seededIds.size + NON_INVOICE_DEMOS.length} demo documents`);
  if (options?.closeAfter) {
    await closeDb();
  }
}

async function main(): Promise<void> {
  await runSeed({ closeAfter: true });
}

if (import.meta.main) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("seed failed", error);
    process.exit(1);
  });
}
