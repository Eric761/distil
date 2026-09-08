import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  ERROR_CODES,
  type DocumentDetail,
  type DocumentListQuery,
  type DocumentListResponse,
  type DocumentSummary,
  type ProcessingAttemptSummary,
} from "@invoice/contracts";
import { getDb } from "../db/client.js";
import {
  documentFiles,
  documents,
  extractionFields,
  invoiceRecords,
  processingAttempts,
} from "../db/schema.js";
import { AppError, notFound } from "../lib/errors.js";
import { getProfileByFixtureId } from "./profiles.js";
import { enqueueProcessing } from "./processing-service.js";

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface SummaryRow {
  id: string;
  originalFilename: string;
  documentType: string;
  sizeBytes: number;
  processingStatus: DocumentSummary["processingStatus"];
  reviewStatus: DocumentSummary["reviewStatus"];
  processingPhase: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  total: string | null;
  currency: string | null;
  currentExtractionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function openIssueCount(extractionId: string | null): Promise<number | null> {
  if (!extractionId) return null;
  const db = getDb();
  const [row] = await db
    .select({ c: count() })
    .from(extractionFields)
    .where(and(eq(extractionFields.extractionId, extractionId), eq(extractionFields.needsAttention, true)));
  return Number(row?.c ?? 0);
}

function mapSummary(row: SummaryRow, openIssues: number | null): DocumentSummary {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    documentType: "invoice",
    sizeBytes: row.sizeBytes,
    processingStatus: row.processingStatus,
    reviewStatus: row.reviewStatus,
    processingPhase: row.processingPhase,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    vendorName: row.vendorName,
    invoiceNumber: row.invoiceNumber,
    total: row.total,
    currency: row.currency,
    openIssues,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDocuments(query: DocumentListQuery): Promise<DocumentListResponse> {
  const db = getDb();
  const conditions = [];

  if (query.search) {
    const like = `%${query.search}%`;
    conditions.push(or(ilike(documents.originalFilename, like), ilike(invoiceRecords.vendorName, like)));
  }
  if (query.processingStatus && query.processingStatus.length > 0) {
    conditions.push(inArray(documents.processingStatus, query.processingStatus));
  }
  if (query.reviewStatus && query.reviewStatus.length > 0) {
    conditions.push(inArray(documents.reviewStatus, query.reviewStatus));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn =
    query.sort === "vendorName"
      ? invoiceRecords.vendorName
      : query.sort === "total"
        ? invoiceRecords.total
        : query.sort === "createdAt"
          ? documents.createdAt
          : documents.updatedAt;
  const orderBy = query.direction === "asc" ? asc(sortColumn) : desc(sortColumn);

  const base = db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      documentType: documents.documentType,
      sizeBytes: documents.sizeBytes,
      processingStatus: documents.processingStatus,
      reviewStatus: documents.reviewStatus,
      processingPhase: documents.processingPhase,
      failureCode: documents.failureCode,
      failureMessage: documents.failureMessage,
      vendorName: invoiceRecords.vendorName,
      invoiceNumber: invoiceRecords.invoiceNumber,
      total: invoiceRecords.total,
      currency: invoiceRecords.currency,
      currentExtractionId: documents.currentExtractionId,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .leftJoin(invoiceRecords, eq(invoiceRecords.documentId, documents.id));

  const rows = (where ? await base.where(where).orderBy(orderBy).limit(query.pageSize).offset((query.page - 1) * query.pageSize) : await base.orderBy(orderBy).limit(query.pageSize).offset((query.page - 1) * query.pageSize)) as SummaryRow[];

  const totalQuery = db
    .select({ c: count() })
    .from(documents)
    .leftJoin(invoiceRecords, eq(invoiceRecords.documentId, documents.id));
  const totalRows = where ? await totalQuery.where(where) : await totalQuery;
  const total = Number(totalRows[0]?.c ?? 0);

  const activeRows = await db
    .select({ c: count() })
    .from(documents)
    .where(inArray(documents.processingStatus, ["queued", "processing"]));
  const activeProcessingCount = Number(activeRows[0]?.c ?? 0);

  const items = await Promise.all(
    rows.map(async (row) => mapSummary(row, await openIssueCount(row.currentExtractionId))),
  );

  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
    activeProcessingCount,
  };
}

async function loadSummary(documentId: string): Promise<DocumentSummary> {
  const db = getDb();
  const [row] = (await db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      documentType: documents.documentType,
      sizeBytes: documents.sizeBytes,
      processingStatus: documents.processingStatus,
      reviewStatus: documents.reviewStatus,
      processingPhase: documents.processingPhase,
      failureCode: documents.failureCode,
      failureMessage: documents.failureMessage,
      vendorName: invoiceRecords.vendorName,
      invoiceNumber: invoiceRecords.invoiceNumber,
      total: invoiceRecords.total,
      currency: invoiceRecords.currency,
      currentExtractionId: documents.currentExtractionId,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .leftJoin(invoiceRecords, eq(invoiceRecords.documentId, documents.id))
    .where(eq(documents.id, documentId))
    .limit(1)) as SummaryRow[];
  if (!row) throw notFound("Document not found.");
  return mapSummary(row, await openIssueCount(row.currentExtractionId));
}

export async function getDocumentDetail(documentId: string): Promise<DocumentDetail> {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw notFound("Document not found.");

  const summary = await loadSummary(documentId);

  const [attempt] = await db
    .select()
    .from(processingAttempts)
    .where(eq(processingAttempts.documentId, documentId))
    .orderBy(desc(processingAttempts.attemptNumber))
    .limit(1);

  const latestAttempt: ProcessingAttemptSummary | null = attempt
    ? {
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        phase: attempt.phase,
        errorCode: attempt.errorCode,
        errorMessage: attempt.errorMessage,
        startedAt: attempt.startedAt ? attempt.startedAt.toISOString() : null,
        finishedAt: attempt.finishedAt ? attempt.finishedAt.toISOString() : null,
      }
    : null;

  const [record] = await db
    .select()
    .from(invoiceRecords)
    .where(eq(invoiceRecords.documentId, documentId))
    .limit(1);

  const canRetry =
    doc.processingStatus === "failed" && doc.failureCode !== "UNSUPPORTED_FIXTURE";

  return {
    summary,
    latestAttempt,
    canRetry,
    hasExtraction: doc.currentExtractionId !== null,
    approvedAt: doc.approvedAt ? doc.approvedAt.toISOString() : null,
    invoiceRecord: record
      ? {
          vendorName: record.vendorName,
          invoiceNumber: record.invoiceNumber,
          invoiceDate: record.invoiceDate,
          dueDate: record.dueDate,
          currency: record.currency,
          subtotal: record.subtotal,
          tax: record.tax,
          total: record.total,
        }
      : null,
  };
}

export async function getDocumentContent(documentId: string): Promise<{ filename: string; bytes: Buffer }> {
  const db = getDb();
  const [doc] = await db
    .select({ filename: documents.originalFilename })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) throw notFound("Document not found.");
  const [file] = await db
    .select({ content: documentFiles.content })
    .from(documentFiles)
    .where(eq(documentFiles.documentId, documentId))
    .limit(1);
  if (!file) throw notFound("Document file not found.");
  return { filename: doc.filename, bytes: file.content };
}

interface IngestResult {
  document: DocumentSummary;
  duplicate: boolean;
}

async function persistDocument(args: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<IngestResult> {
  const db = getDb();

  if (!args.bytes.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
    throw new AppError({
      code: ERROR_CODES.UNSUPPORTED_FILE,
      status: 400,
      title: "Unsupported file",
      detail: "Only PDF documents are supported.",
    });
  }

  const sha = sha256Hex(args.bytes);
  const [existing] = await db.select({ id: documents.id }).from(documents).where(eq(documents.sha256, sha)).limit(1);
  if (existing) {
    return { document: await loadSummary(existing.id), duplicate: true };
  }

  const inserted = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        originalFilename: args.filename,
        mimeType: args.mimeType,
        sizeBytes: args.bytes.byteLength,
        sha256: sha,
        documentType: "invoice",
        processingStatus: "uploaded",
        reviewStatus: "not_ready",
      })
      .returning({ id: documents.id });
    await tx.insert(documentFiles).values({ documentId: doc!.id, content: args.bytes });
    return doc!.id;
  });

  return { document: await loadSummary(inserted), duplicate: false };
}

export async function ingestUpload(args: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  autoProcess?: boolean;
}): Promise<IngestResult> {
  const result = await persistDocument(args);
  if (!result.duplicate && args.autoProcess) {
    await enqueueProcessing(result.document.id, false);
  }
  return result;
}

export async function ingestSample(
  fixtureId: string,
  options?: { autoProcess?: boolean },
): Promise<IngestResult> {
  const profile = await getProfileByFixtureId(fixtureId);
  if (!profile) throw notFound("Unknown sample.");
  const result = await persistDocument({
    filename: profile.filename,
    mimeType: "application/pdf",
    bytes: Buffer.from(profile.pdfBytes),
  });
  const autoProcess = options?.autoProcess ?? true;
  if (autoProcess && result.document.processingStatus === "uploaded") {
    await enqueueProcessing(result.document.id, false);
  }
  return result;
}
