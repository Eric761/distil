import { z } from "zod";
import {
  currencyCode,
  decimalString,
  documentType,
  pagination,
  rawDate,
  processingStatus,
  queryStringArray,
  reviewStatus,
} from "./common.js";

/** Compact row for the document library table. */
export const documentSummary = z.object({
  id: z.string().uuid(),
  originalFilename: z.string(),
  documentType,
  sizeBytes: z.number().int().min(0),
  processingStatus,
  reviewStatus,
  /** Short human phrase for the current processing phase, when active. */
  processingPhase: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  /** Normalized preview fields (populated once extraction commits). */
  vendorName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  total: decimalString.nullable(),
  currency: currencyCode.nullable(),
  /** Count of fields still needing attention. */
  openIssues: z.number().int().min(0).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DocumentSummary = z.infer<typeof documentSummary>;

export const documentListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(200).optional(),
  processingStatus: queryStringArray(processingStatus).optional(),
  reviewStatus: queryStringArray(reviewStatus).optional(),
  sort: z
    .enum(["createdAt", "updatedAt", "vendorName", "total"])
    .default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export type DocumentListQuery = z.infer<typeof documentListQuery>;

export const documentListResponse = z.object({
  items: z.array(documentSummary),
  pagination,
  /** How many documents are actively processing (drives global indicator). */
  activeProcessingCount: z.number().int().min(0),
});
export type DocumentListResponse = z.infer<typeof documentListResponse>;

/** Detail view header: metadata + latest processing attempt summary. */
export const processingAttemptSummary = z.object({
  attemptNumber: z.number().int().min(1),
  status: z.enum(["queued", "processing", "succeeded", "partial", "failed"]),
  phase: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});
export type ProcessingAttemptSummary = z.infer<typeof processingAttemptSummary>;

export const documentDetail = z.object({
  summary: documentSummary,
  latestAttempt: processingAttemptSummary.nullable(),
  /** Whether a retryable failure exists. */
  canRetry: z.boolean(),
  /** Whether an extraction is available to review. */
  hasExtraction: z.boolean(),
  approvedAt: z.string().datetime().nullable(),
  invoiceRecord: z
    .object({
      vendorName: z.string().nullable(),
      invoiceNumber: z.string().nullable(),
      invoiceDate: rawDate.nullable(),
      dueDate: rawDate.nullable(),
      currency: currencyCode.nullable(),
      subtotal: decimalString.nullable(),
      tax: decimalString.nullable(),
      total: decimalString.nullable(),
    })
    .nullable(),
});
export type DocumentDetail = z.infer<typeof documentDetail>;

/** Response after a successful upload or sample ingestion. */
export const uploadResponse = z.object({
  document: documentSummary,
  /** True when the server returned an existing duplicate rather than a new row. */
  duplicate: z.boolean(),
});
export type UploadResponse = z.infer<typeof uploadResponse>;

export const processRequest = z.object({
  retry: z.boolean().optional(),
});
export type ProcessRequest = z.infer<typeof processRequest>;

export const processResponse = z.object({
  document: documentSummary,
  attempt: processingAttemptSummary,
  /** Suggested client poll interval in ms. */
  pollHintMs: z.number().int().min(250),
});
export type ProcessResponse = z.infer<typeof processResponse>;

/** Sample fixtures the client can ingest without local assets. */
export const sampleDescriptor = z.object({
  fixtureId: z.string(),
  title: z.string(),
  vendorName: z.string(),
  scenario: z.string(),
  /** One-line description of the edge case this fixture demonstrates. */
  demonstrates: z.string(),
});
export type SampleDescriptor = z.infer<typeof sampleDescriptor>;

export const sampleListResponse = z.object({
  samples: z.array(sampleDescriptor),
});
export type SampleListResponse = z.infer<typeof sampleListResponse>;
