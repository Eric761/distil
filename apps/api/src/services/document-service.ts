import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  ERROR_CODES,
  GENERIC_DOCUMENT_TYPE,
  INVOICE_TYPE,
  type DocumentDetail,
  type DocumentListQuery,
  type DocumentListResponse,
  type DocumentParse,
  type DocumentSummary,
  type ParseBlock,
  type ProcessingAttemptSummary,
  type SummaryValue,
} from "@invoice/contracts";
import { detectFormat, parseDocument, PARSER_VERSION } from "@invoice/extraction";
import { getDb } from "../db/client.js";
import {
  documentFiles,
  documentParses,
  documents,
  extractionFields,
  invoiceRecords,
  processingAttempts,
} from "../db/schema.js";
import { AppError, notFound } from "../lib/errors.js";
import { getDemoDocumentById } from "../db/demo-documents.js";
import { getProfileByFixtureId } from "./profiles.js";
import { enqueueProcessing } from "./processing-service.js";

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface SummaryRow {
  id: string;
  originalFilename: string;
  mimeType: string;
  documentType: string;
  schemaName: string | null;
  sourceKind: string;
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

/**
 * Generic schema-declared summary values for non-invoice documents. Uses the
 * leading scalar fields (which the extractors flag as summary columns) so the
 * library shows something meaningful for every document type.
 */
async function loadSummaryValues(
  documentType: string,
  extractionId: string | null,
): Promise<SummaryValue[]> {
  if (documentType === INVOICE_TYPE || !extractionId) return [];
  const db = getDb();
  const rows = await db
    .select({
      schemaFieldKey: extractionFields.schemaFieldKey,
      label: extractionFields.label,
      valueText: extractionFields.valueText,
      path: extractionFields.path,
    })
    .from(extractionFields)
    .where(and(eq(extractionFields.extractionId, extractionId), eq(extractionFields.nodeKind, "scalar")))
    .orderBy(asc(extractionFields.sortOrder))
    .limit(200);

  const topLevel = rows
    .filter((r) => !r.path.includes("[") && r.valueText != null && r.valueText !== "")
    .slice(0, 4)
    .map((r) => ({
      key: r.schemaFieldKey ?? r.path,
      label: r.label,
      value: r.valueText,
    }));
  if (topLevel.length > 0) return topLevel;

  // Table-only documents (especially CSV) have no top-level scalar. Surface a
  // record count plus representative values from the first row instead of an
  // empty summary.
  const repeated = rows
    .map((row) => ({ row, match: /^([A-Za-z0-9_]+)\[(\d+)\]\.(.+)$/u.exec(row.path) }))
    .filter((entry) => entry.match && entry.row.valueText != null && entry.row.valueText !== "");
  if (repeated.length === 0) return [];

  const rowIndexes = new Set(repeated.map((entry) => entry.match![2]));
  const firstIndex = repeated[0]!.match![2];
  const firstRow = repeated.filter((entry) => entry.match![2] === firstIndex).slice(0, 2);
  return [
    {
      key: `${repeated[0]!.match![1]}Count`,
      label: "Records",
      value: `${rowIndexes.size}${rows.length === 200 ? "+" : ""}`,
    },
    ...firstRow.map(({ row }) => ({
      key: row.schemaFieldKey ?? row.path,
      label: row.label,
      value: row.valueText,
    })),
  ];
}

async function mapSummary(row: SummaryRow, openIssues: number | null): Promise<DocumentSummary> {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    documentType: row.documentType,
    documentFormat:
      detectFormat(row.originalFilename, row.mimeType) ??
      (row.sourceKind === "pdf" ? "pdf" : "txt"),
    schemaName: row.schemaName,
    sourceKind: (row.sourceKind as DocumentSummary["sourceKind"]) ?? "pdf",
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
    summaryValues: await loadSummaryValues(row.documentType, row.currentExtractionId),
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
      mimeType: documents.mimeType,
      documentType: documents.documentType,
      schemaName: documents.schemaName,
      sourceKind: documents.sourceKind,
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
    rows.map(async (row) => await mapSummary(row, await openIssueCount(row.currentExtractionId))),
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
      schemaName: documents.schemaName,
      sourceKind: documents.sourceKind,
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
  return await mapSummary(row, await openIssueCount(row.currentExtractionId));
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

  const nonRetryable = new Set([
    "UNSUPPORTED_FIXTURE",
    ERROR_CODES.UNSUPPORTED_FILE,
    ERROR_CODES.OCR_REQUIRED,
    ERROR_CODES.EMPTY_DOCUMENT,
  ]);
  const canRetry = doc.processingStatus === "failed" && !nonRetryable.has(doc.failureCode ?? "");

  return {
    summary,
    latestAttempt,
    currentExtractionId: doc.currentExtractionId,
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

export async function getDocumentContent(
  documentId: string,
): Promise<{ filename: string; mimeType: string; bytes: Buffer }> {
  const db = getDb();
  const [doc] = await db
    .select({ filename: documents.originalFilename, mimeType: documents.mimeType })
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
  return { filename: doc.filename, mimeType: doc.mimeType, bytes: file.content };
}

/** The immutable canonical parse for the safe text/source viewer. */
export async function getDocumentParse(documentId: string): Promise<DocumentParse> {
  const db = getDb();
  const [doc] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw notFound("Document not found.");
  const [existingParse] = await db
    .select()
    .from(documentParses)
    .where(eq(documentParses.documentId, documentId))
    .orderBy(desc(documentParses.createdAt))
    .limit(1);
  if (!existingParse) throw notFound("This document has no canonical parse (fixtures render as PDF only).");

  let parse = existingParse;
  if (parse.parserVersion !== PARSER_VERSION) {
    const file = await getDocumentContent(documentId);
    const fresh = await parseDocument({
      bytes: file.bytes,
      filename: file.filename,
      mime: file.mimeType,
    });
    const contentHash = createHash("sha256").update(fresh.text).digest("hex");
    const [stored] = await db
      .insert(documentParses)
      .values({
        documentId,
        sourceKind: fresh.sourceKind,
        text: fresh.text,
        blocks: fresh.blocks,
        pages: fresh.pages,
        parserVersion: fresh.parserVersion,
        contentHash,
      })
      .returning();
    parse = stored!;
  }

  return {
    documentId,
    parseId: parse.id,
    sourceKind: parse.sourceKind === "text" ? "text" : "pdf",
    text: parse.text,
    blocks: parse.blocks as ParseBlock[],
    pages: parse.pages,
    parserVersion: parse.parserVersion,
  };
}

interface IngestResult {
  document: DocumentSummary;
  duplicate: boolean;
}

async function persistDocument(args: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  /** Fixtures are known invoices; user uploads are generic until classified. */
  documentType?: string;
}): Promise<IngestResult> {
  const db = getDb();

  const format = detectFormat(args.filename, args.mimeType);
  if (!format) {
    throw new AppError({
      code: ERROR_CODES.UNSUPPORTED_FILE,
      status: 400,
      title: "Unsupported file",
      detail: "Supported document types: PDF, TXT, Markdown, CSV, HTML.",
    });
  }
  // PDFs must actually be PDFs; text formats are validated at parse time.
  if (format === "pdf" && !args.bytes.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
    throw new AppError({
      code: ERROR_CODES.UNSUPPORTED_FILE,
      status: 400,
      title: "Unsupported file",
      detail: "This file has a .pdf name but is not a valid PDF.",
    });
  }

  const sourceKind = format === "pdf" ? "pdf" : "text";
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
        documentType: args.documentType ?? GENERIC_DOCUMENT_TYPE,
        sourceKind,
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
  if (!profile) {
    const demo = getDemoDocumentById(fixtureId);
    if (!demo) throw notFound("Unknown sample.");
    const result = await persistDocument({
      filename: demo.filename,
      mimeType: demo.mimeType,
      bytes: Buffer.from(demo.content, "utf8"),
      documentType: GENERIC_DOCUMENT_TYPE,
    });
    const autoProcess = options?.autoProcess ?? true;
    if (autoProcess && result.document.processingStatus === "uploaded") {
      await enqueueProcessing(result.document.id, false);
    }
    return result;
  }
  const result = await persistDocument({
    filename: profile.filename,
    mimeType: "application/pdf",
    bytes: Buffer.from(profile.pdfBytes),
    documentType: INVOICE_TYPE,
  });
  const autoProcess = options?.autoProcess ?? true;
  if (autoProcess && result.document.processingStatus === "uploaded") {
    await enqueueProcessing(result.document.id, false);
  }
  return result;
}
