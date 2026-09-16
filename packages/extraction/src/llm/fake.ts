import type { LlmExtractionRaw, LlmProvider } from "./provider.js";

/**
 * A deterministic fake provider for tests. It echoes a fixed set of proposed
 * fields (optionally derived from the input) so provider-gate and grounding
 * behavior can be asserted without network access or credentials.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly model = "fake-model";
  calls = 0;
  constructor(private readonly canned?: (text: string) => LlmExtractionRaw) {}

  async extract(input: { text: string }): Promise<LlmExtractionRaw> {
    this.calls += 1;
    if (this.canned) return this.canned(input.text);
    // Default: propose the first non-empty line as a "title" with a real quote.
    const firstLine = input.text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    return {
      fields: [
        {
          key: "title",
          label: "Title",
          path: "title",
          type: "string",
          value: firstLine || null,
          presence: firstLine ? "present" : "not_found",
          confidence: 0.9,
          quote: firstLine || null,
        },
      ],
      note: null,
    };
  }
}
