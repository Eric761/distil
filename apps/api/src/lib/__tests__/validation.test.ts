import { describe, expect, it } from "vitest";
import {
  approvalBlockers,
  computeNeedsAttention,
  type FieldValidation,
  type WorkingField,
  validateFields,
} from "../validation.js";

function field(overrides: Partial<WorkingField> = {}): WorkingField {
  return {
    id: overrides.id ?? "f1",
    path: overrides.path ?? "invoiceNumber",
    group: overrides.group ?? "identity",
    type: overrides.type ?? "string",
    required: overrides.required ?? true,
    material: overrides.material ?? true,
    label: overrides.label ?? "Invoice number",
    extractedValue: overrides.extractedValue ?? "INV-1",
    correctedValue: overrides.correctedValue ?? null,
    reviewState: overrides.reviewState ?? "needs_review",
    confidenceState: overrides.confidenceState ?? "high",
  };
}

describe("approvalBlockers", () => {
  it("blocks approval when a required field is invalid", () => {
    const fields = [field({ extractedValue: "09/17/2024", type: "date" })];
    const validations = validateFields(fields);

    const blockers = approvalBlockers(fields, validations);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.message).toMatch(/valid date/i);
  });

  it("blocks approval when a material field still needs review", () => {
    const fields = [
      field({
        path: "total",
        label: "Total",
        type: "decimal",
        extractedValue: "5400.00",
        confidenceState: "conflicting",
      }),
    ];
    const validations = validateFields(fields);

    const blockers = approvalBlockers(fields, validations);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.path).toBe("total");
  });

  it("allows approval when required fields are confirmed and valid", () => {
    const fields = [
      field({ reviewState: "confirmed" }),
      field({
        id: "f2",
        path: "total",
        label: "Total",
        type: "decimal",
        extractedValue: "100.00",
        reviewState: "confirmed",
      }),
    ];
    const validations = validateFields(fields);

    expect(approvalBlockers(fields, validations)).toEqual([]);
  });

  it("still blocks when a confirmed field has a hard validation error", () => {
    const fields = [field({ reviewState: "confirmed", extractedValue: "09/17/2024", type: "date" })];
    const validations = validateFields(fields);

    expect(approvalBlockers(fields, validations)).toHaveLength(1);
  });
});

describe("computeNeedsAttention", () => {
  it("treats reconciliation warnings as resolved after explicit confirm", () => {
    const f = field({ reviewState: "confirmed" });
    const validation: FieldValidation = {
      state: "warning",
      issues: [{ severity: "warning", message: "Subtotal does not reconcile." }],
    };

    expect(computeNeedsAttention(f, validation)).toBe(false);
  });
});
