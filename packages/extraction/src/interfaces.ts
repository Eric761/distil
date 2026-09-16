import type {
  ConfidenceState,
  FieldType,
  NodeKind,
  PresenceState,
  SchemaTree,
  ValueOrigin,
} from "@invoice/contracts";
import type { CanonicalParse } from "./canonical.js";

/** A resolved provenance span into the canonical text (and optional page). */
export interface ResolvedSpan {
  offsetStart: number;
  offsetEnd: number;
  page: number | null;
  groundingStatus: "grounded" | "unresolved" | "none";
  quote: string;
}

/** One extracted field instance, ready to be committed to extraction_fields. */
export interface ExtractedFieldValue {
  schemaFieldKey: string;
  path: string;
  label: string;
  group: string;
  type: FieldType;
  nodeKind: NodeKind;
  required: boolean;
  material: boolean;
  presenceState: PresenceState;
  valueOrigin: ValueOrigin;
  value: unknown | null;
  confidenceScore: number | null;
  confidenceState: ConfidenceState;
  confidenceReason: string | null;
  parseConfidence: number | null;
  sources: ResolvedSpan[];
}

export type ExtractionStatus = "succeeded" | "partial" | "degraded";

/** Coverage/quality signals used by the LLM gate and status reporting. */
export interface QualityMetrics {
  usableLeafCount: number;
  totalLeafCount: number;
  usableRatio: number;
  hasUsableTable: boolean;
  requiredMaterialUsableRatio: number;
  anyMaterialUnusable: boolean;
}

export interface ExtractionResult {
  schema: SchemaTree;
  fields: ExtractedFieldValue[];
  status: ExtractionStatus;
  statusNote: string | null;
  presentSections: string[];
  quality: QualityMetrics;
  extractorKey: "fixture" | "structural" | "llm";
  providerModel?: string;
}

/** The common extractor contract: parse in, schema-shaped result out. */
export interface Extractor {
  readonly key: "fixture" | "structural" | "llm";
  extract(parse: CanonicalParse): Promise<ExtractionResult> | ExtractionResult;
}
