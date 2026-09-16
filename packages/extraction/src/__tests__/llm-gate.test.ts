import { describe, expect, it } from "vitest";
import { parsePlainText } from "../parsers/text.js";
import { extractStructural } from "../structural/extract.js";
import { shouldInvokeLlm } from "../llm/gate.js";
import { LlmExtractor } from "../llm/extractor.js";
import { FakeLlmProvider } from "../llm/fake.js";

const richParse = parsePlainText(
  "Invoice\n\nVendor: Acme\nNumber: A-1\nDate: 2024-01-01\nTotal: 100.00\nTax: 8.00\n",
);
const sparseParse = parsePlainText("Some unstructured prose with no labeled fields whatsoever.");

describe("shouldInvokeLlm", () => {
  it("never opens the gate without an API key", () => {
    const result = extractStructural(richParse);
    const decision = shouldInvokeLlm({
      hasKey: false,
      parse: richParse,
      quality: result.quality,
      publishedSchema: false,
      fieldDefCount: result.schema.fields.length,
    });
    expect(decision.open).toBe(false);
    expect(decision.reason).toBe("no_api_key");
  });

  it("does not open the gate for high-coverage structural output", () => {
    const result = extractStructural(richParse);
    const decision = shouldInvokeLlm({
      hasKey: true,
      parse: richParse,
      quality: result.quality,
      publishedSchema: false,
      fieldDefCount: result.schema.fields.length,
    });
    expect(decision.open).toBe(false);
    expect(decision.reason).toBe("structural_sufficient");
  });

  it("opens the gate for a sparse ad-hoc extraction when a key is set", () => {
    const result = extractStructural(sparseParse);
    const decision = shouldInvokeLlm({
      hasKey: true,
      parse: sparseParse,
      quality: result.quality,
      publishedSchema: false,
      fieldDefCount: result.schema.fields.length,
    });
    expect(decision.open).toBe(true);
    expect(decision.reason).toBe("adhoc_sparse");
  });

  it("refuses to call the provider when the document exceeds the char cap", () => {
    const big = parsePlainText("x".repeat(10));
    const decision = shouldInvokeLlm({
      hasKey: true,
      parse: big,
      quality: extractStructural(sparseParse).quality,
      publishedSchema: false,
      fieldDefCount: 0,
      caps: { maxPages: 50, maxInputChars: 5, maxInputTokens: 50000, chunkChars: 24000, maxChunks: 8 },
    });
    expect(decision.open).toBe(false);
    expect(decision.reason).toBe("over_char_cap");
  });
});

describe("LlmExtractor", () => {
  it("grounds provider quotes locally and records the model", async () => {
    const provider = new FakeLlmProvider((text) => ({
      fields: [
        {
          key: "vendor",
          label: "Vendor",
          path: "vendor",
          type: "string",
          value: "Acme",
          presence: "present",
          confidence: 0.95,
          quote: "Acme",
        },
        {
          key: "phantom",
          label: "Phantom",
          path: "phantom",
          type: "string",
          value: "Nowhere",
          presence: "present",
          confidence: 0.95,
          quote: "this quote is not in the document",
        },
      ],
      note: null,
    }));
    const extractor = new LlmExtractor(provider);
    const result = await extractor.extract(richParse);

    expect(provider.calls).toBe(1);
    expect(result.providerModel).toBe("fake-model");

    const vendor = result.fields.find((f) => f.schemaFieldKey === "vendor")!;
    expect(vendor.sources[0]?.groundingStatus).toBe("grounded");

    // Ungrounded values are penalized and never trusted at high confidence.
    const phantom = result.fields.find((f) => f.schemaFieldKey === "phantom")!;
    expect(phantom.sources[0]?.groundingStatus).toBe("unresolved");
    expect(phantom.confidenceScore).toBeLessThanOrEqual(0.5);
  });
});
