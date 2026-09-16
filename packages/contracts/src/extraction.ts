import { z } from "zod";
import {
  confidenceState,
  fieldType,
  groundingStatus,
  nodeKind,
  presenceState,
  reviewFieldState,
  sourceKind,
  valueOrigin,
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

/**
 * One region of a source citation. A citation may resolve to several regions
 * (a quote spanning multiple text runs / lines / pages). For text documents,
 * `page` is null and the viewer uses character offsets instead of a box.
 */
export const sourceRegion = z.object({
  page: z.number().int().min(1).nullable(),
  box: boundingBox.nullable(),
});
export type SourceRegion = z.infer<typeof sourceRegion>;

/**
 * A pointer from a field back to a region of the source document.
 *
 * Provenance is expressed two complementary ways:
 *  - `page` + `box` for PDF canvas highlighting (nullable for text formats).
 *  - `offsetStart` / `offsetEnd` half-open UTF-16 offsets into the canonical
 *    parsed text, for the safe TextViewer.
 * `regions` carries any additional boxes when a quote spans multiple runs.
 */
export const sourceReference = z.object({
  id: z.string(),
  /** Present for PDF citations; null for text-format citations. */
  page: z.number().int().min(1).nullable(),
  /** Absent when we only have a text reference (no reliable box). */
  box: boundingBox.nullable(),
  /** Half-open UTF-16 offsets into the canonical parsed text (text formats). */
  offsetStart: z.number().int().min(0).nullable(),
  offsetEnd: z.number().int().min(0).nullable(),
  /** Whether the quote resolved back to canonical text. */
  groundingStatus: groundingStatus,
  /** Additional regions when a single citation spans multiple runs/pages. */
  regions: z.array(sourceRegion),
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
 *
 * This envelope is document-agnostic. A schema of any shape is projected into a
 * flat list of these instances; the frontend derives sections and dynamic
 * record tables from `group`, `schemaFieldKey`, and the instance `path`.
 */
export const extractionField = z.object({
  id: z.string(),
  /** Instance path, e.g. "vendorName" or "lineItems[2].lineTotal". */
  path: z.string(),
  /** Stable schema-field identity, e.g. "vendorName" or "lineItems[].lineTotal". */
  schemaFieldKey: z.string(),
  label: z.string(),
  /** Logical group/section used to render field sections. Open string. */
  group: z.string(),
  type: fieldType,
  /** Structural role of this field instance. */
  nodeKind,
  required: z.boolean(),
  /** Material fields participate in reconciliation / trust. */
  material: z.boolean(),

  /** Raw value produced by the extractor. May be null for missing fields. */
  extractedValue: z.unknown().nullable(),
  /** Human correction, if any. Null means "no correction". */
  correctedValue: z.unknown().nullable(),
  /** Convenience: corrected ?? extracted, respecting not_applicable. */
  effectiveValue: z.unknown().nullable(),

  /** Explicit presence state (distinct from a null value). */
  presenceState,
  /** Whether the value was extracted, inferred, or derived. */
  valueOrigin,

  /** Extraction certainty (how sure the extractor is of the value). */
  confidenceScore: z.number().min(0).max(1).nullable(),
  confidenceState,
  confidenceReason: z.string().nullable(),
  /** Parse certainty (how sure we are the text was read correctly). */
  parseConfidence: z.number().min(0).max(1).nullable(),

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

/**
 * A node in the schema tree. Recursive: objects carry `children`, arrays carry
 * a single `item` describing repeated elements. The tree drives review section
 * layout, dynamic record-table columns, and Explore summary columns.
 */
export interface SchemaFieldDef {
  key: string;
  label: string;
  type: z.infer<typeof fieldType>;
  nodeKind: z.infer<typeof nodeKind>;
  group: string;
  required: boolean;
  material: boolean;
  description?: string | null;
  /** Curated cross-schema semantic concept, e.g. "organization" | "amount". */
  semanticKey?: string | null;
  /** Whether this field is a summary column in Explore. */
  isSummary?: boolean;
  /** For object nodes. */
  children?: SchemaFieldDef[];
  /** For array nodes: the shape of each repeated item. */
  item?: SchemaFieldDef | null;
  /** Allowed values for enum types. */
  enumValues?: string[] | null;
}

export const schemaFieldDef: z.ZodType<SchemaFieldDef> = z.lazy(() =>
  z.object({
    key: z.string(),
    label: z.string(),
    type: fieldType,
    nodeKind,
    group: z.string(),
    required: z.boolean(),
    material: z.boolean(),
    description: z.string().nullable().optional(),
    semanticKey: z.string().nullable().optional(),
    isSummary: z.boolean().optional(),
    children: z.array(schemaFieldDef).optional(),
    item: schemaFieldDef.nullable().optional(),
    enumValues: z.array(z.string()).nullable().optional(),
  }),
);

/** Lifecycle of a schema version. */
export const schemaStatus = z.enum(["draft", "published"]);
export type SchemaStatus = z.infer<typeof schemaStatus>;

/** The schema a document was extracted against (family + version + fields). */
export const schemaTree = z.object({
  key: z.string(),
  name: z.string(),
  version: z.string(),
  status: schemaStatus,
  /** True when this is an inferred, not-yet-published ad-hoc proposal. */
  adHoc: z.boolean(),
  fields: z.array(schemaFieldDef),
});
export type SchemaTree = z.infer<typeof schemaTree>;

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
  /** Optimistic-lock revision of this extraction. */
  version: z.number().int().min(1),
  documentType: z.string(),
  schemaVersion: z.string(),
  /** The schema version/proposal row backing this extraction, when available. */
  schemaVersionId: z.string().uuid().nullable(),
  /** The schema this extraction was produced against. */
  schema: schemaTree,
  /** How the source is rendered for provenance. */
  sourceKind,
  status: z.enum(["succeeded", "partial", "degraded"]),
  /** Sections present. A partial extraction omits at least one. Open strings. */
  presentSections: z.array(z.string()),
  /** Flat field instances — the source of truth for review/query/provenance. */
  fields: z.array(extractionField),
  /** Derived nested JSON view of the effective values (for JSON/export). */
  data: z.unknown(),
  progress: reviewProgress,
  approvalBlockers: z.array(approvalBlocker),
  /** Human explanation when status is partial/degraded. */
  statusNote: z.string().nullable(),
  /** Page count and normalized page aspect ratios for the PDF viewer. */
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
  action: z.enum([
    "confirm",
    "correct",
    "not_applicable",
    "resolve_conflict",
    "add_item",
    "remove_item",
  ]),
  /** Required for "correct"; the typed replacement value. */
  value: z.unknown().optional(),
  /** Required for "resolve_conflict": which candidate was chosen. */
  candidateId: z.string().optional(),
  /** For add_item/remove_item: the array's schema path, e.g. "lineItems". */
  arrayPath: z.string().optional(),
});
export type FieldChange = z.infer<typeof fieldChange>;

export const saveExtractionRequest = z.object({
  /** Compare-and-swap: the extraction the client is editing. */
  expectedExtractionId: z.string().uuid().optional(),
  expectedVersion: z.number().int().min(1),
  changes: z.array(fieldChange).min(1),
});
export type SaveExtractionRequest = z.infer<typeof saveExtractionRequest>;

export const approveRequest = z.object({
  expectedExtractionId: z.string().uuid().optional(),
  expectedVersion: z.number().int().min(1),
});
export type ApproveRequest = z.infer<typeof approveRequest>;
