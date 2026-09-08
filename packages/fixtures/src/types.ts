import type {
  BoundingBox,
  ConfidenceState,
  FieldType,
} from "@invoice/contracts";

export type Section = "identity" | "dates" | "amounts" | "lineItems" | "metadata";

/** A drawn text token. When `sourcePath` is set, its box is recorded. */
export interface TextToken {
  text: string;
  sourcePath?: string;
}

export interface MetaRow {
  label: string;
  value: TextToken;
}

export interface AmountRow {
  label: string;
  value: TextToken;
  emphasize?: boolean;
}

export interface LineItemRowLayout {
  description: TextToken;
  qty: TextToken;
  unitPrice: TextToken;
  lineTotal: TextToken;
}

export interface InvoiceLayout {
  documentTitle: string;
  vendorName: TextToken;
  vendorAddress: string[];
  meta: MetaRow[];
  billTo?: string[];
  lineItemHeaders: {
    description: string;
    qty: string;
    unitPrice: string;
    lineTotal: string;
  };
  lineItems: LineItemRowLayout[];
  amounts: AmountRow[];
  notes?: string[];
}

export interface RecordedBox {
  page: number;
  box: BoundingBox;
  text: string;
}

export interface RenderResult {
  pdfBytes: Uint8Array;
  pages: Array<{ page: number; widthPt: number; heightPt: number }>;
  boxes: Record<string, RecordedBox>;
}

/** A conflicting candidate spec, referencing a drawn source token. */
export interface ConflictCandidateSpec {
  id: string;
  label: string;
  value: unknown | null;
  sourcePath?: string | null;
}

/** Static description of one extracted field (pre-review). */
export interface FieldSpec {
  path: string;
  label: string;
  group: Section;
  type: FieldType;
  required: boolean;
  material: boolean;
  extractedValue: unknown | null;
  confidenceScore: number | null;
  confidenceState: ConfidenceState;
  confidenceReason: string | null;
  /** Key into rendered boxes. Defaults to `path`. `null` => no visual box. */
  sourcePath?: string | null;
  /** Overrides the recorded source text (e.g. show label + value context). */
  sourceTextOverride?: string;
  conflictCandidates?: ConflictCandidateSpec[];
}

export type AttemptOutcome =
  | { outcome: "succeeded" }
  | { outcome: "partial"; missingSections: Section[]; note: string }
  | { outcome: "failed"; code: string; message: string; retryable: boolean };

export interface FixtureDefinition {
  fixtureId: string;
  filename: string;
  descriptor: {
    title: string;
    vendorName: string;
    scenario: string;
    demonstrates: string;
  };
  processing: {
    phases: string[];
    /** One entry per attempt number (1-based). */
    attempts: AttemptOutcome[];
  };
  layout: InvoiceLayout;
  buildFields: () => FieldSpec[];
  expectedRecord: {
    vendorName: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    currency: string | null;
    subtotal: string | null;
    tax: string | null;
    total: string | null;
  };
}
