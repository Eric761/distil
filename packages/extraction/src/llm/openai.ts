import type { LlmExtractionRaw, LlmProvider } from "./provider.js";

const SYSTEM_PROMPT = [
  "You are a precise document data extractor.",
  "Return ONLY JSON matching the requested schema.",
  "For every field, include a `quote`: a VERBATIM substring copied from the document that supports the value.",
  "Never invent quotes or page/coordinate information. If a value is absent, set presence to 'not_found' and value to null.",
  "If text is present but unreadable/garbled, use presence 'unreadable'. If multiple conflicting values exist, use 'ambiguous'.",
].join(" ");

interface OpenAiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * OpenAI Structured-Outputs adapter (Chat Completions with JSON response
 * format). Constructed only when OPENAI_API_KEY is set; the gate decides
 * whether it is ever called. Network failures surface as errors so the caller
 * can fall back to the structural result.
 */
export class OpenAiProvider implements LlmProvider {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAiOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async extract(input: {
    text: string;
    fieldHints?: Array<{ key: string; label: string; type: string }>;
  }): Promise<LlmExtractionRaw> {
    const hintText = input.fieldHints && input.fieldHints.length > 0
      ? `Extract these fields when present: ${input.fieldHints.map((f) => `${f.key} (${f.type})`).join(", ")}.`
      : "Identify the salient labeled fields and any repeated records (tables) in the document.";

    const userPrompt = [
      hintText,
      "Respond with JSON of the form:",
      '{ "fields": [ { "key": string, "label": string, "path": string, "type": string, "value": string|null, "presence": "present"|"not_found"|"unreadable"|"ambiguous", "confidence": number, "quote": string|null } ], "note": string|null }',
      "Document:",
      "\"\"\"",
      input.text,
      "\"\"\"",
    ].join("\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`OpenAI request failed: ${res.status}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content) as LlmExtractionRaw;
      return { fields: Array.isArray(parsed.fields) ? parsed.fields : [], note: parsed.note ?? null };
    } finally {
      clearTimeout(timer);
    }
  }
}
