import { z } from "zod";
import {
  confidenceState,
  fieldType,
  reviewFieldState,
  validationState,
} from "./common.js";

/**
 * A normalized bounding box in 0..1 page coordinates. Normalized coordinates
 * stay stable across zoom levels and viewer sizes, so the frontend can map
 * them onto the rendered canvas deterministically.
 */
export const boundingBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type BoundingBox = z.infer<typeof boundingBox>;

/** A pointer from a field back to a region of the source document. */
export const sourceReference = z.object({
  id: z.string(),
  page: z.number().int().min(1),
  /** Absent when we only have a text reference (no reliable box). */
  box: boundingBox.nullable(),
  sourceText: z.string(),
  /** For conflicting fields: which candidate this reference supports. */
  candidateRank: z.number().int().nullable(),
});
export type SourceReference = z.infer<typeof sourceReference>;

/** A competing candidate value for a conflicting field. */
export const conflictCandidate = z.object({
  id: z.string(),
  label: z.string(),
  value: z.unknown().nullable(),
  sourceReferenceId: z.string().nullable(),
});
export type ConflictCandidate = z.infer<typeof conflictCandidate>;

export const validationIssue = z.object({
  severity: z.enum(["error", "warning"]),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssue>;

/**
 * The field envelope. Every reviewable value carries enough metadata to drive
 * the review UX: what was extracted, what (if anything) the human corrected,
 * how confident the extractor is, whether it validates, and where it came from.
 */
export const extractionField = z.object({
  id: z.string(),
  /** Stable dotted path, e.g. "vendorName" or "lineItems[2].lineTotal". */
  path: z.string(),
  label: z.string(),
  /** Logical group used to render field sections. */
  group: z.enum(["identity", "dates", "amounts", "lineItems", "metadata"]),
  type: fieldType,
  required: z.boolean(),
  /** Material fields participate in amount reconciliation / trust. */
  material: z.boolean(),

  /** Raw value produced by the extractor. May be null for missing fields. */
  extractedValue: z.unknown().nullable(),
  /** Human correction, if any. Null means "no correction". */
  correctedValue: z.unknown().nullable(),
  /** Convenience: corrected ?? extracted, respecting not_applicable. */
  effectiveValue: z.unknown().nullable(),

  confidenceScore: z.number().min(0).max(1).nullable(),
  confidenceState,
  confidenceReason: z.string().nullable(),

  validationState,
  validationIssues: z.array(validationIssue),

  reviewState: reviewFieldState,
  correctedAt: z.string().datetime().nullable(),
  /** True when this field still needs an explicit human decision. */
  needsAttention: z.boolean(),

  sourceReferences: z.array(sourceReference),
  conflictCandidates: z.array(conflictCandidate),
});
export type ExtractionField = z.infer<typeof extractionField>;

/** A single line item, modelled as a group of cell-level fields. */
export const lineItemRow = z.object({
  id: z.string(),
  position: z.number().int().min(0),
  fields: z.object({
    description: extractionField,
    quantity: extractionField,
    unitPrice: extractionField,
    lineTotal: extractionField,
  }),
});
export type LineItemRow = z.infer<typeof lineItemRow>;

/** Summary of what blocks approval, surfaced before the user tries. */
export const approvalBlocker = z.object({
  fieldId: z.string().nullable(),
  path: z.string().nullable(),
  message: z.string(),
});
export type ApprovalBlocker = z.infer<typeof approvalBlocker>;

export const reviewProgress = z.object({
  totalAttentionFields: z.number().int().min(0),
  resolvedAttentionFields: z.number().int().min(0),
});
export type ReviewProgress = z.infer<typeof reviewProgress>;

/** The full review model returned by GET /documents/:id/extraction. */
export const extractionDetail = z.object({
  documentId: z.string().uuid(),
  extractionId: z.string().uuid(),
  version: z.number().int().min(1),
  schemaVersion: z.string(),
  status: z.enum(["succeeded", "partial"]),
  /** Sections present. A partial extraction omits at least one. */
  presentSections: z.array(
    z.enum(["identity", "dates", "amounts", "lineItems", "metadata"]),
  ),
  fields: z.array(extractionField),
  lineItems: z.array(lineItemRow),
  progress: reviewProgress,
  approvalBlockers: z.array(approvalBlocker),
  /** Page count and normalized page aspect ratios for the viewer. */
  pages: z.array(
    z.object({
      page: z.number().int().min(1),
      widthPt: z.number().positive(),
      heightPt: z.number().positive(),
    }),
  ),
});
export type ExtractionDetail = z.infer<typeof extractionDetail>;

/* ------------------------------------------------------------------ */
/* Mutation contracts                                                  */
/* ------------------------------------------------------------------ */

/** A single field change in a review save batch. */
export const fieldChange = z.object({
  fieldId: z.string(),
  action: z.enum(["confirm", "correct", "not_applicable", "resolve_conflict"]),
  /** Required for "correct"; the typed replacement value. */
  value: z.unknown().optional(),
  /** Required for "resolve_conflict": which candidate was chosen. */
  candidateId: z.string().optional(),
});
export type FieldChange = z.infer<typeof fieldChange>;

export const saveExtractionRequest = z.object({
  expectedVersion: z.number().int().min(1),
  changes: z.array(fieldChange).min(1),
});
export type SaveExtractionRequest = z.infer<typeof saveExtractionRequest>;

export const approveRequest = z.object({
  expectedVersion: z.number().int().min(1),
});
export type ApproveRequest = z.infer<typeof approveRequest>;
