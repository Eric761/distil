import { z } from "zod";

/**
 * Shared primitive schemas and domain enums.
 *
 * These describe *state dimensions* that the product deliberately keeps
 * separate. Confidence, validation, and review status answer different
 * questions and must never be collapsed into a single value.
 */

export const uuid = z.string().uuid();

/**
 * Query-string arrays arrive as a single string when exactly one value is
 * present (`?reviewStatus=approved`) and as a string[] when several are
 * (`?reviewStatus=approved&reviewStatus=ready`) — that's how Node's query
 * parser behaves. Normalize both shapes to an array before validating each
 * member so a single-value filter doesn't fail with "Expected array,
 * received string".
 */
export const queryStringArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) =>
      value === undefined || value === null
        ? undefined
        : Array.isArray(value)
          ? value
          : [value],
    z.array(schema),
  );

/**
 * Monetary values travel over the wire as decimal strings and are stored as
 * PostgreSQL `numeric`. We never use JS floating point for money math.
 */
export const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/u, "Must be a decimal number");

/** ISO 4217 currency code (uppercase 3 letters). */
export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/u, "Must be a 3-letter ISO currency code");

/** ISO 8601 calendar date (YYYY-MM-DD). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Must be an ISO date (YYYY-MM-DD)");

/** Document type. MVP only parses invoices/vendor bills. */
export const documentType = z.enum(["invoice"]);
export type DocumentType = z.infer<typeof documentType>;

/**
 * Processing status: where the async extraction pipeline is.
 *  - uploaded:   bytes persisted, not yet queued
 *  - queued:     a processing attempt is waiting for the worker
 *  - processing: worker is actively extracting
 *  - succeeded:  extraction committed, all sections present
 *  - partial:    extraction committed, but a section failed
 *  - failed:     no reviewable extraction committed
 */
export const processingStatus = z.enum([
  "uploaded",
  "queued",
  "processing",
  "succeeded",
  "partial",
  "failed",
]);
export type ProcessingStatus = z.infer<typeof processingStatus>;

/**
 * Review status: the human trust workflow for a document.
 *  - not_ready:    no extraction to review yet
 *  - needs_review: extraction exists with attention items
 *  - ready:        all attention items resolved, safe to approve
 *  - approved:     promoted to a trusted, queryable record
 *  - reopened:     an approved record was edited and must be re-approved
 */
export const reviewStatus = z.enum([
  "not_ready",
  "needs_review",
  "ready",
  "approved",
  "reopened",
]);
export type ReviewStatus = z.infer<typeof reviewStatus>;

/**
 * Confidence state: how certain the extractor is about a field.
 * This is about *extraction certainty*, not correctness.
 */
export const confidenceState = z.enum([
  "high",
  "medium",
  "low",
  "missing",
  "conflicting",
  "inferred",
]);
export type ConfidenceState = z.infer<typeof confidenceState>;

/**
 * Validation state: whether a value passes schema/business rules.
 * A high-confidence value can still be invalid.
 */
export const validationState = z.enum([
  "valid",
  "invalid",
  "warning",
  "not_checked",
]);
export type ValidationState = z.infer<typeof validationState>;

/**
 * Review state: what the human has decided about a field.
 *  - auto_accepted: high confidence + valid, accepted without manual action
 *  - needs_review:  requires an explicit human decision
 *  - confirmed:     human accepted the extracted value as-is
 *  - corrected:     human changed the value (original preserved)
 *  - not_applicable: optional field explicitly marked N/A
 */
export const reviewFieldState = z.enum([
  "auto_accepted",
  "needs_review",
  "confirmed",
  "corrected",
  "not_applicable",
]);
export type ReviewFieldState = z.infer<typeof reviewFieldState>;

/** Field value primitive type. */
export const fieldType = z.enum([
  "string",
  "decimal",
  "date",
  "currency",
  "enum",
  "object",
  "array",
]);
export type FieldType = z.infer<typeof fieldType>;

export const pagination = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(50),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type Pagination = z.infer<typeof pagination>;

/** Human-facing label + machine value pair, used for status chips. */
export interface StatusDescriptor {
  value: string;
  label: string;
}
