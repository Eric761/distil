/**
 * The provider abstraction the LlmExtractor depends on. A real OpenAI adapter
 * and a deterministic fake both implement it, so provider behavior (and the
 * gate) is fully testable without network access or credentials.
 */

/** One leaf value proposed by the provider, with a verbatim supporting quote. */
export interface LlmProposedField {
  /** Stable schema-field key, e.g. "vendorName" or "lineItems[].lineTotal". */
  key: string;
  label: string;
  /** Instance path (arrays expanded), e.g. "lineItems[0].lineTotal". */
  path: string;
  type: string;
  value: string | null;
  presence: "present" | "not_found" | "unreadable" | "ambiguous";
  confidence: number;
  /** Verbatim quote from the source (grounded locally, never trusted as-is). */
  quote: string | null;
}

export interface LlmExtractionRaw {
  fields: LlmProposedField[];
  /** Model-declared note (e.g. partial due to caps). */
  note?: string | null;
}

export interface LlmProvider {
  readonly model: string;
  /**
   * Produce schema-constrained values from canonical text. Implementations must
   * request JSON output; JSON validity is not treated as extraction validity.
   */
  extract(input: {
    text: string;
    /** Optional published-schema field hints to constrain output. */
    fieldHints?: Array<{ key: string; label: string; type: string }>;
  }): Promise<LlmExtractionRaw>;
}
