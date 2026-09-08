import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "./client.js";
import { loadEnv } from "../env.js";
import { documents, extractionFields, invoiceRecords, processingAttempts } from "./schema.js";
import { ingestSample } from "../services/document-service.js";
import { enqueueProcessing, processDueAttempts } from "../services/processing-service.js";
import { getProfiles } from "../services/profiles.js";

const HELD_PROCESSING_STATES = {
  "prismworks-uploaded": { processingStatus: "uploaded", reviewStatus: "not_ready", phase: null },
  "harborstone-queued": { processingStatus: "queued", reviewStatus: "not_ready", phase: "Queued" },
  "everline-processing": { processingStatus: "processing", reviewStatus: "not_ready", phase: "Extracting line items" },
} as const;

/** Approved records — available in Query and export. */
const APPROVED_FIXTURES = [
  "acme-clean",
  "vantage-retail",
  "summit-foods",
  "pinevalley-biotech",
  "orbital-market",
  "keystone-fabrication",
  "canyon-clinic",
] as const;

/** Previously approved, then reopened for re-review. */
const REOPENED_FIXTURES = ["northstar-terminology", "aster-capital"] as const;

/** Extraction failed — retryable from the document list. */
const FAILED_FIXTURES = ["novafoods-failed", "trailhead-outdoor"] as const;

/** Partial extraction — retry may recover more fields. */
const PARTIAL_RETRY_FIXTURES = ["redbrick-partial"] as const;

async function markApproved(documentId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc?.currentExtractionId) return;

  await db.transaction(async (tx) => {
    await tx
      .update(extractionFields)
      .set({ reviewState: "confirmed", needsAttention: false })
      .where(eq(extractionFields.extractionId, doc.currentExtractionId!));
    await tx
      .update(invoiceRecords)
      .set({ approvedAt: now, updatedAt: now })
      .where(eq(invoiceRecords.documentId, documentId));
    await tx
      .update(documents)
      .set({ reviewStatus: "approved", approvedAt: now, updatedAt: now })
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

async function holdProcessingState(
  documentId: string,
  state: (typeof HELD_PROCESSING_STATES)[keyof typeof HELD_PROCESSING_STATES],
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

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.SEED_DEMO_DATA) {
    // eslint-disable-next-line no-console
    console.log("SEED_DEMO_DATA is false; skipping demo seed.");
    await closeDb();
    return;
  }

  const profiles = await getProfiles();
  const seededIds = new Map<string, string>();
  for (const profile of profiles) {
    const result = await ingestSample(profile.fixtureId);
    seededIds.set(profile.fixtureId, result.document.id);
    // eslint-disable-next-line no-console
    console.log(`${result.duplicate ? "exists" : "seeded"}: ${profile.descriptor.title}`);
  }

  // eslint-disable-next-line no-console
  console.log("processing seeded documents...");
  await processDueAttempts();

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

  const failedMessages: Record<string, string> = {
    "novafoods-failed": "LOW_QUALITY_SCAN",
    "trailhead-outdoor": "EXTRACTOR_TIMEOUT",
  };
  for (const fixtureId of FAILED_FIXTURES) {
    const documentId = seededIds.get(fixtureId);
    if (documentId) await markFailed(documentId, failedMessages[fixtureId]);
  }

  for (const [fixtureId, state] of Object.entries(HELD_PROCESSING_STATES)) {
    const documentId = seededIds.get(fixtureId);
    if (documentId) await holdProcessingState(documentId, state);
  }

  // eslint-disable-next-line no-console
  console.log(`seed complete — ${seededIds.size} demo documents`);
  await closeDb();
}

try {
  await main();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error("seed failed", error);
  process.exit(1);
}
