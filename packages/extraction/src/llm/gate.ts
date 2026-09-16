import type { CanonicalParse } from "../canonical.js";
import type { QualityMetrics } from "../interfaces.js";

/** Per-document input caps (v1 defaults; configurable downward by the caller). */
export interface LlmCaps {
  maxPages: number;
  maxInputChars: number;
  maxInputTokens: number;
  chunkChars: number;
  maxChunks: number;
}

export const DEFAULT_CAPS: LlmCaps = {
  maxPages: 50,
  maxInputChars: 200_000,
  maxInputTokens: 50_000,
  chunkChars: 24_000,
  maxChunks: 8,
};

/** Coarse token estimate (~4 chars/token) used to enforce the token budget. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

export interface GateContext {
  hasKey: boolean;
  parse: CanonicalParse;
  quality: QualityMetrics;
  /** True when extraction targeted a published schema (vs. an ad-hoc draft). */
  publishedSchema: boolean;
  fieldDefCount: number;
  caps?: LlmCaps;
}

export interface GateDecision {
  open: boolean;
  reason: string;
}

/**
 * The cost-control gate. The optional OpenAI LlmExtractor is invoked ONLY when
 * a key is set, the document fits within the input caps, and at least one
 * explicit poor-quality criterion is met. Fixtures and high-coverage structural
 * results never open the gate. See the plan's "Exact LLM Gate Criteria".
 */
export function shouldInvokeLlm(ctx: GateContext): GateDecision {
  if (!ctx.hasKey) return { open: false, reason: "no_api_key" };

  const caps = ctx.caps ?? DEFAULT_CAPS;
  const chars = ctx.parse.text.length;
  if (ctx.parse.pages.length > caps.maxPages) return { open: false, reason: "over_page_cap" };
  if (chars > caps.maxInputChars) return { open: false, reason: "over_char_cap" };
  if (estimateTokens(Math.min(chars, caps.chunkChars * caps.maxChunks)) > caps.maxInputTokens && chars > caps.maxInputChars) {
    return { open: false, reason: "over_token_cap" };
  }
  if (chars < 8) return { open: false, reason: "empty" };

  const q = ctx.quality;

  // 1. Schema inference failed.
  if (ctx.fieldDefCount === 0) return { open: true, reason: "schema_inference_failed" };

  // 2. Published-schema coverage poor.
  if (ctx.publishedSchema) {
    if (q.requiredMaterialUsableRatio < 0.7 || q.anyMaterialUnusable) {
      return { open: true, reason: "published_coverage_poor" };
    }
  }

  // 3. Ad-hoc extraction too sparse.
  if (!ctx.publishedSchema) {
    if (q.usableLeafCount < 3 && !q.hasUsableTable) {
      return { open: true, reason: "adhoc_sparse" };
    }
    if (q.usableRatio < 0.5) {
      return { open: true, reason: "adhoc_low_coverage" };
    }
  }

  return { open: false, reason: "structural_sufficient" };
}
