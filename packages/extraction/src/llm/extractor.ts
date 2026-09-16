import type {
  ConfidenceState,
  FieldType,
  PresenceState,
  SchemaFieldDef,
  SchemaTree,
} from "@invoice/contracts";
import type { CanonicalParse } from "../canonical.js";
import type { ExtractedFieldValue, ExtractionResult } from "../interfaces.js";
import { resolveQuote } from "../structural/grounding.js";
import { computeQuality } from "../structural/extract.js";
import { humanizeLabel, normalizeValue } from "../typing.js";
import { DEFAULT_CAPS, type LlmCaps } from "./gate.js";
import type { LlmProvider } from "./provider.js";

const KNOWN_TYPES = new Set<FieldType>([
  "string", "text", "integer", "decimal", "date", "datetime", "boolean", "currency", "enum", "object", "array",
]);

function coerceType(raw: string): FieldType {
  const t = raw.toLowerCase() as FieldType;
  return KNOWN_TYPES.has(t) ? t : "string";
}

function confidenceStateFor(score: number): ConfidenceState {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function mapPresence(p: string): PresenceState {
  switch (p) {
    case "not_found":
      return "not_found";
    case "unreadable":
      return "unreadable";
    case "ambiguous":
      return "ambiguous";
    default:
      return "present";
  }
}

/**
 * The optional, gated LLM extractor. It sends canonical text (within the input
 * caps) to a provider, then applies quote-then-resolve grounding locally so
 * every value is cited against our own parsed text — never model coordinates.
 */
export class LlmExtractor {
  readonly key = "llm" as const;
  constructor(
    private readonly provider: LlmProvider,
    private readonly caps: LlmCaps = DEFAULT_CAPS,
  ) {}

  async extract(parse: CanonicalParse): Promise<ExtractionResult> {
    const budget = Math.min(this.caps.maxInputChars, this.caps.chunkChars * this.caps.maxChunks);
    const truncated = parse.text.length > budget;
    const payload = truncated ? parse.text.slice(0, budget) : parse.text;

    const raw = await this.provider.extract({ text: payload });

    const fields: ExtractedFieldValue[] = [];
    const schemaFields: SchemaFieldDef[] = [];
    const seenSchemaKeys = new Set<string>();

    for (const f of raw.fields) {
      const type = coerceType(f.type);
      const presence = mapPresence(f.presence);
      const span = f.quote ? resolveQuote(parse, f.quote) : null;
      const grounded = span?.groundingStatus === "grounded";
      // Ungrounded values are penalized: we never fully trust an unverifiable quote.
      const baseConfidence = Math.max(0, Math.min(1, f.confidence ?? 0.5));
      const score = grounded ? baseConfidence : Math.min(baseConfidence, 0.5);
      const isArrayItem = f.path.includes("[");

      if (!seenSchemaKeys.has(f.key)) {
        seenSchemaKeys.add(f.key);
        schemaFields.push({
          key: f.key,
          label: f.label || humanizeLabel(f.key),
          type,
          nodeKind: "scalar",
          group: isArrayItem ? "records" : "details",
          required: false,
          material: false,
          isSummary: schemaFields.length < 4,
        });
      }

      fields.push({
        schemaFieldKey: f.key,
        path: f.path || f.key,
        label: f.label || humanizeLabel(f.key),
        group: isArrayItem ? "records" : "details",
        type,
        nodeKind: "scalar",
        required: false,
        material: false,
        presenceState: f.value == null && presence === "present" ? "not_found" : presence,
        valueOrigin: "extracted",
        value: f.value == null ? null : normalizeValue(type, f.value),
        confidenceScore: score,
        confidenceState: confidenceStateFor(score),
        confidenceReason: grounded
          ? "Model-extracted value grounded to the source text."
          : "Model-extracted value; supporting quote could not be located in the source.",
        parseConfidence: parse.sourceKind === "pdf" ? 0.9 : 1,
        sources: span ? [span] : [],
      });
    }

    const quality = computeQuality(fields);
    const schema: SchemaTree = {
      key: `adhoc_llm`,
      name: "Document",
      version: "draft",
      status: "draft",
      adHoc: true,
      fields: schemaFields,
    };

    const status = truncated ? "partial" : quality.usableRatio >= 0.4 ? "succeeded" : "degraded";
    const statusNote = truncated
      ? "The document exceeded the model input budget; only the first section was analyzed."
      : raw.note ?? null;

    return {
      schema,
      fields,
      status,
      statusNote,
      presentSections: [...new Set(schemaFields.map((f) => (f.group === "records" ? "Records" : "Details")))],
      quality,
      extractorKey: "llm",
      providerModel: this.provider.model,
    };
  }
}
