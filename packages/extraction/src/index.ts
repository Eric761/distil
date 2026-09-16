export * from "./canonical.js";
export * from "./interfaces.js";
export { parseDocument, detectFormat, ParseError } from "./parsers/index.js";
export type { ParseErrorCode, ParseInput, SupportedFormat } from "./parsers/index.js";
export { analyze } from "./parsers/analyze.js";
export { parsePlainText, normalizeText } from "./parsers/text.js";
export { parseCsv, parseCsvRows } from "./parsers/csv.js";
export { parseHtml } from "./parsers/html.js";
export { parsePdf, textLayerToLines } from "./parsers/pdf.js";

export { extractStructural, extractStructuralWithSchema, computeQuality } from "./structural/extract.js";
export { buildResumeSchemaFields } from "./structural/narrative-sections.js";
export { resolveQuote, spanFromOffsets } from "./structural/grounding.js";
export {
  slugKey,
  humanizeLabel,
  inferType,
  inferColumnType,
  normalizeValue,
} from "./typing.js";

export { shouldInvokeLlm, estimateTokens, DEFAULT_CAPS } from "./llm/gate.js";
export type { LlmCaps, GateContext, GateDecision } from "./llm/gate.js";
export { LlmExtractor } from "./llm/extractor.js";
export { OpenAiProvider } from "./llm/openai.js";
export { FakeLlmProvider } from "./llm/fake.js";
export type { LlmProvider, LlmProposedField, LlmExtractionRaw } from "./llm/provider.js";
