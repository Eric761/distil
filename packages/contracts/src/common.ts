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

/**
 * Date value as extracted or stored during review. May not be ISO-normalized
 * until a human corrects it (e.g. "09/17/2024" pending normalization).
 */
export const rawDate = z.string();

/**
 * Document type. Distil is a general document-intelligence platform: the type
 * is an open, stable string that identifies the logical document family (e.g.
 * "invoice", "receipt", "contract", "resume") or the generic fallback
 * "document" for as-yet-unclassified inputs. "invoice" retains its trusted,
 * projection-backed behavior for backward compatibility.
 */
export const documentType = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/u, "Must be a lowercase slug");
export type DocumentType = z.infer<typeof documentType>;

/** The built-in, projection-backed invoice type. */
export const INVOICE_TYPE = "invoice" as const;
/** Generic fallback for unclassified documents. */
export const GENERIC_DOCUMENT_TYPE = "document" as const;

/**
 * How the source document is rendered for provenance. PDFs use the pdf.js
 * canvas viewer with page boxes; text-native formats use the safe TextViewer
 * driven by character offsets.
 */
export const sourceKind = z.enum(["pdf", "text"]);
export type SourceKind = z.infer<typeof sourceKind>;

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
  "text", // long free text (multi-line)
  "integer",
  "decimal",
  "date",
  "datetime",
  "boolean",
  "currency",
  "enum",
  "object",
  "array",
]);
export type FieldType = z.infer<typeof fieldType>;

/**
 * Structural role of a schema node / field instance.
 *  - scalar: a single leaf value
 *  - object: a nested group of fields
 *  - array:  a repeated collection (of scalars or objects)
 */
export const nodeKind = z.enum(["scalar", "object", "array"]);
export type NodeKind = z.infer<typeof nodeKind>;

/**
 * Explicit presence state of an extracted value. These are deliberately
 * distinct from a null value or an empty string: a document can be missing a
 * field, mark it not applicable, or contain text that could not be read.
 */
export const presenceState = z.enum([
  "present",
  "empty", // present in the document but explicitly blank
  "not_found",
  "not_applicable",
  "unreadable",
  "parse_error",
  "extraction_error",
  "ambiguous",
]);
export type PresenceState = z.infer<typeof presenceState>;

/** Where a value came from: extracted verbatim, inferred, or derived/computed. */
export const valueOrigin = z.enum(["extracted", "inferred", "derived"]);
export type ValueOrigin = z.infer<typeof valueOrigin>;

/**
 * Whether a source citation could be resolved back to the canonical parsed
 * text. Ungrounded quotes remain visible with their exact text and reason.
 */
export const groundingStatus = z.enum(["grounded", "unresolved", "none"]);
export type GroundingStatus = z.infer<typeof groundingStatus>;

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
