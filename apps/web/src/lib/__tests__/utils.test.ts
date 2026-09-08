import { describe, expect, it } from "vitest";
import { formatBytes, formatMoney } from "../utils";

describe("formatMoney", () => {
  it("renders an em dash for null values", () => {
    expect(formatMoney(null, "USD")).toBe("—");
  });

  it("prefixes known currency symbols", () => {
    expect(formatMoney("868", "USD")).toBe("$868.00");
    expect(formatMoney("1190.5", "EUR")).toBe("€1,190.50");
    expect(formatMoney("42", "GBP")).toBe("£42.00");
  });

  it("appends the code for currencies without a known symbol", () => {
    expect(formatMoney("100", "JPY")).toBe("100.00 JPY");
  });

  it("always shows two fraction digits and thousands separators", () => {
    expect(formatMoney("1637.284", "USD")).toBe("$1,637.28");
  });
});

describe("formatBytes", () => {
  it("scales bytes to human units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
