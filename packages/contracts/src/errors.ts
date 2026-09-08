import { z } from "zod";

/**
 * RFC 9457-style problem shape used for every API error. The frontend parses
 * this so failures become actionable rather than "something went wrong".
 */
export const problemDetail = z.object({
  code: z.string(),
  title: z.string(),
  detail: z.string(),
  status: z.number().int(),
  requestId: z.string().optional(),
  /** Field-addressable errors, keyed by field path where relevant. */
  fieldErrors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  /** Optional structured context (e.g. current version on a conflict). */
  meta: z.record(z.unknown()).optional(),
});
export type ProblemDetail = z.infer<typeof problemDetail>;

/** Stable machine codes surfaced to the UI for specific recovery paths. */
export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE_DOCUMENT: "DUPLICATE_DOCUMENT",
  UNSUPPORTED_FILE: "UNSUPPORTED_FILE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  EXTRACTION_NOT_READY: "EXTRACTION_NOT_READY",
  STALE_EXTRACTION_VERSION: "STALE_EXTRACTION_VERSION",
  APPROVAL_BLOCKED: "APPROVAL_BLOCKED",
  ALREADY_APPROVED: "ALREADY_APPROVED",
  PROCESSING_IN_PROGRESS: "PROCESSING_IN_PROGRESS",
  QUERY_NEEDS_CLARIFICATION: "QUERY_NEEDS_CLARIFICATION",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
