import { describe, expect, it } from "vitest";
import { rulesForSchema } from "../rules.js";
import { validateFields, type WorkingField } from "../validation.js";

function field(overrides: Partial<WorkingField> = {}): WorkingField {
  return {
    id: overrides.id ?? "f1",
    path: overrides.path ?? "vendorName",
    group: overrides.group ?? "identity",
    type: overrides.type ?? "string",
    required: overrides.required ?? false,
    material: overrides.material ?? false,
    label: overrides.label ?? "Vendor",
    extractedValue: overrides.extractedValue ?? "Acme",
    correctedValue: overrides.correctedValue ?? null,
    reviewState: overrides.reviewState ?? "needs_review",
    confidenceState: overrides.confidenceState ?? "high",
  };
}

/** A minimal invoice with a mispriced line item and a subtotal+tax mismatch. */
function invoiceFields(): WorkingField[] {
  return [
    field({ id: "q0", path: "lineItems[0].quantity", type: "decimal", extractedValue: "2.00", group: "lineItems" }),
    field({ id: "u0", path: "lineItems[0].unitPrice", type: "decimal", extractedValue: "10.00", group: "lineItems" }),
    // 2 x 10 should be 20.00, but 25.00 is recorded -> line-math warning.
    field({ id: "t0", path: "lineItems[0].lineTotal", type: "decimal", extractedValue: "25.00", group: "lineItems" }),
    field({ id: "sub", path: "subtotal", type: "decimal", extractedValue: "20.00", group: "amounts" }),
    field({ id: "tax", path: "tax", type: "decimal", extractedValue: "2.00", group: "amounts" }),
    // subtotal + tax = 22.00, but total says 30.00 -> reconciliation warning.
    field({ id: "total", path: "total", type: "decimal", extractedValue: "30.00", group: "amounts" }),
  ];
}

describe("rulesForSchema", () => {
  it("applies invoice reconciliation only to the invoice schema", () => {
    expect(rulesForSchema("invoice")).toEqual(["invoiceReconciliation"]);
    expect(rulesForSchema("resume")).toEqual(["genericDateOrder", "genericTableCompleteness"]);
    expect(rulesForSchema(null)).toEqual([]);
    expect(rulesForSchema(undefined)).toEqual([]);
  });
});

describe("invoiceReconciliation rule", () => {
  it("flags line-math and subtotal+tax mismatches when the invoice rule runs", () => {
    const fields = invoiceFields();
    const validations = validateFields(fields, ["invoiceReconciliation"]);

    expect(validations.get("t0")?.state).toBe("warning");
    expect(validations.get("t0")?.issues[0]?.message).toMatch(/but/i);
    // The subtotal is flagged because a line total looked mispriced.
    expect(validations.get("sub")?.state).toBe("warning");
  });

  it("never runs reconciliation for a generic document", () => {
    const fields = invoiceFields();
    const validations = validateFields(fields, rulesForSchema("resume"));

    // Generic rules do not perform invoice-specific amount reconciliation.
    expect(validations.get("t0")?.state ?? "valid").toBe("valid");
    expect(validations.get("total")?.state ?? "valid").toBe("valid");
  });
});

describe("generic schema rules", () => {
  it("flags common date-order mistakes", () => {
    const fields = [
      field({ id: "start", path: "startDate", label: "Start date", type: "date", extractedValue: "2026-06-30" }),
      field({ id: "target", path: "targetDate", label: "Target date", type: "date", extractedValue: "2026-02-01" }),
    ];

    const validations = validateFields(fields, rulesForSchema("project_brief"));

    expect(validations.get("target")?.state).toBe("warning");
    expect(validations.get("target")?.issues[0]?.message).toMatch(/before Start date/i);
  });

  it("flags empty material cells in repeated records", () => {
    const fields = [
      field({
        id: "priority",
        path: "tickets[0].priority",
        label: "Priority",
        type: "string",
        material: true,
        extractedValue: "",
      }),
    ];

    const validations = validateFields(fields, rulesForSchema("support_tickets"));

    expect(validations.get("priority")?.state).toBe("warning");
    expect(validations.get("priority")?.issues[0]?.message).toMatch(/empty in a repeated record/i);
  });
});
