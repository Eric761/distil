import { describe, expect, it } from "vitest";
import { equalsCents, formatCents, normalizeDecimal, toScaled } from "../money.js";

describe("money helpers", () => {
  it("normalizes decimal strings to two fractional digits", () => {
    expect(normalizeDecimal("100")).toBe("100.00");
    expect(normalizeDecimal("100.5")).toBe("100.50");
    expect(normalizeDecimal("1234.567")).toBe("1234.57");
  });

  it("rounds to cents with half-up semantics", () => {
    expect(formatCents(toScaled("10.004"))).toBe("10.00");
    expect(formatCents(toScaled("10.005"))).toBe("10.01");
    expect(equalsCents(toScaled("10.004"), toScaled("10.002"))).toBe(true);
  });
});
