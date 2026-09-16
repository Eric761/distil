import {
  DEFAULT_CAPS,
  LlmExtractor,
  OpenAiProvider,
  computeQuality,
  extractStructural,
  extractStructuralWithSchema,
  shouldInvokeLlm,
  slugKey,
  type CanonicalParse,
  type ExtractionResult,
  type LlmCaps,
} from "@invoice/extraction";
import type { SchemaTree } from "@invoice/contracts";
import { loadEnv } from "../env.js";

function capsFromEnv(): LlmCaps {
  const env = loadEnv();
  return {
    maxPages: env.LLM_MAX_PAGES,
    maxInputChars: env.LLM_MAX_INPUT_CHARS,
    maxInputTokens: env.LLM_MAX_INPUT_TOKENS,
    chunkChars: env.LLM_CHUNK_CHARS,
    maxChunks: env.LLM_MAX_CHUNKS,
  };
}

function llmMatchesForSchema(llm: ExtractionResult): Map<string, (typeof llm.fields)[number]> {
  const matches = new Map<string, (typeof llm.fields)[number]>();
  for (const field of llm.fields) {
    for (const key of [field.schemaFieldKey, field.path, field.label]) {
      const normalized = slugKey(key);
      if (normalized && !matches.has(normalized)) matches.set(normalized, field);
    }
  }
  return matches;
}

function overlayLlmValuesOnSchema(
  structural: ExtractionResult,
  llm: ExtractionResult,
): ExtractionResult {
  const matches = llmMatchesForSchema(llm);
  const fields = structural.fields.map((field) => {
    if (field.presenceState === "present" && (field.confidenceScore ?? 0) >= 0.75) return field;
    const match =
      matches.get(slugKey(field.schemaFieldKey)) ??
      matches.get(slugKey(field.path)) ??
      matches.get(slugKey(field.label));
    if (!match || match.value == null) return field;
    return {
      ...field,
      presenceState: match.presenceState,
      valueOrigin: match.valueOrigin,
      value: match.value,
      confidenceScore: match.confidenceScore,
      confidenceState: match.confidenceState,
      confidenceReason: `Model-assisted match for selected schema field. ${match.confidenceReason ?? ""}`.trim(),
      sources: match.sources,
    };
  });
  const quality = computeQuality(fields);
  const status = quality.requiredMaterialUsableRatio < 0.7 || quality.usableRatio < 0.5 ? "partial" : "succeeded";
  return {
    ...structural,
    fields,
    status,
    statusNote:
      status === "partial"
        ? "The document was re-extracted against the selected schema; some schema fields were not found."
        : "Structural extraction was improved with model-assisted schema matches.",
    quality,
    extractorKey: "llm",
    providerModel: llm.providerModel,
  };
}

/**
 * Run the non-fixture extraction pipeline for a canonical parse:
 * deterministic structural preflight first, then the optional OpenAI
 * LlmExtractor only when the cost-control gate opens (key set, within caps,
 * and poor structural coverage). The gate and provider errors fail safe back
 * to the structural result so extraction always produces something reviewable.
 */
export async function runGenericExtraction(
  parse: CanonicalParse,
  targetSchema?: SchemaTree | null,
): Promise<ExtractionResult> {
  const env = loadEnv();
  const caps = capsFromEnv();
  if (targetSchema) {
    const structural = extractStructuralWithSchema(parse, targetSchema);
    const decision = shouldInvokeLlm({
      hasKey: Boolean(env.OPENAI_API_KEY),
      parse,
      quality: structural.quality,
      publishedSchema: true,
      fieldDefCount: targetSchema.fields.length,
      caps,
    });
    if (!decision.open || !env.OPENAI_API_KEY) return structural;
    try {
      const provider = new OpenAiProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        baseUrl: env.OPENAI_BASE_URL,
      });
      const llm = new LlmExtractor(provider, caps);
      const result = await llm.extract(parse);
      if (result.fields.length === 0) return structural;
      return overlayLlmValuesOnSchema(structural, result);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("LLM schema extraction failed; falling back to structural", error);
      return {
        ...structural,
        statusNote:
          structural.statusNote ??
          "The AI extractor was unavailable; showing the deterministic structural extraction.",
      };
    }
  }

  const structural = extractStructural(parse);

  const decision = shouldInvokeLlm({
    hasKey: Boolean(env.OPENAI_API_KEY),
    parse,
    quality: structural.quality,
    publishedSchema: false,
    fieldDefCount: structural.schema.fields.length,
    caps,
  });

  if (!decision.open || !env.OPENAI_API_KEY) {
    return structural;
  }

  try {
    const provider = new OpenAiProvider({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      baseUrl: env.OPENAI_BASE_URL,
    });
    const llm = new LlmExtractor(provider, caps);
    const result = await llm.extract(parse);
    if (result.fields.length === 0) return structural;
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("LLM extraction failed; falling back to structural", error);
    return {
      ...structural,
      statusNote:
        structural.statusNote ??
        "The AI extractor was unavailable; showing the deterministic structural extraction.",
    };
  }
}

export { DEFAULT_CAPS };
