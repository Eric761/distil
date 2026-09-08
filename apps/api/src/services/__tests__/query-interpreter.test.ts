import { describe, expect, it } from "vitest";
import { buildChips, interpretQuery } from "../query-interpreter.js";

describe("interpretQuery", () => {
  it("maps amount and currency filters from natural language", () => {
    const result = interpretQuery("USD invoices over 500", []);

    expect(result.filters.amount).toEqual({ comparator: "gt", value: "500.00" });
    expect(result.filters.currency).toBe("USD");
    expect(result.needsClarification).toBe(false);
    expect(buildChips(result.filters).map((c) => c.display)).toEqual(["> 500.00", "USD"]);
  });

  it("matches a known vendor phrase from the allowlist", () => {
    const result = interpretQuery("invoices from Acme Office Supply Co. above 100", [
      "Acme Office Supply Co.",
      "Northstar Logistics LLC",
    ]);

    expect(result.filters.vendor).toBe("Acme Office Supply Co.");
    expect(result.filters.amount).toEqual({ comparator: "gt", value: "100.00" });
  });

  it("surfaces unparsed terms instead of silently applying them", () => {
    const result = interpretQuery("widgets from Acme", ["Acme Office Supply Co."]);

    expect(result.warnings.some((w) => w.startsWith("Ignored:"))).toBe(true);
    expect(result.unparsedTerms).toContain("widgets");
  });

  it("returns needsClarification when no filters can be derived", () => {
    const result = interpretQuery("show me everything", []);

    expect(Object.keys(result.filters)).toHaveLength(0);
    expect(result.needsClarification).toBe(true);
  });
});
