import type {
  ApprovalBlocker,
  ConfidenceState,
  FieldType,
  ReviewFieldState,
  ValidationIssue,
  ValidationState,
} from "@invoice/contracts";
import { equalsCents, isDecimalString, normalizeDecimal, mulScaled, addScaled, toScaled } from "./money.js";

export interface WorkingField {
  id: string;
  path: string;
  group: string;
  type: FieldType;
  required: boolean;
  material: boolean;
  label: string;
  extractedValue: unknown | null;
  correctedValue: unknown | null;
  reviewState: ReviewFieldState;
  confidenceState: ConfidenceState;
}

export interface FieldValidation {
  state: ValidationState;
  issues: ValidationIssue[];
}

/** corrected ?? extracted, respecting an explicit not-applicable decision. */
export function effectiveValue(field: {
  reviewState: ReviewFieldState;
  correctedValue: unknown | null;
  extractedValue: unknown | null;
}): unknown | null {
  if (field.reviewState === "not_applicable") return null;
  return field.correctedValue ?? field.extractedValue;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const LINE_PATH = /^lineItems\[(\d+)\]\.(description|quantity|unitPrice|lineTotal)$/u;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Type/presence validation for a single field's effective value. */
function validateSingle(field: WorkingField, value: unknown | null): FieldValidation {
  if (value === null || value === undefined || value === "") {
    if (field.reviewState === "not_applicable") {
      return { state: "valid", issues: [] };
    }
    if (field.required) {
      return {
        state: "invalid",
        issues: [{ severity: "error", message: `${field.label} is required.` }],
      };
    }
    return { state: "valid", issues: [] };
  }

  const str = asString(value);
  switch (field.type) {
    case "date":
      if (!str || !ISO_DATE.test(str)) {
        return { state: "invalid", issues: [{ severity: "error", message: "Enter a valid date (YYYY-MM-DD)." }] };
      }
      return { state: "valid", issues: [] };
    case "currency":
      if (!str || !CURRENCY.test(str)) {
        return { state: "invalid", issues: [{ severity: "error", message: "Enter a 3-letter currency code (e.g. USD)." }] };
      }
      return { state: "valid", issues: [] };
    case "decimal":
      if (!str || !isDecimalString(str)) {
        return { state: "invalid", issues: [{ severity: "error", message: "Enter a valid number." }] };
      }
      return { state: "valid", issues: [] };
    default:
      return { state: "valid", issues: [] };
  }
}

/**
 * Validates every field, including cross-field reconciliation:
 * line total math, subtotal integrity, and subtotal + tax = total.
 * Returns a map keyed by field id.
 */
export function validateFields(fields: WorkingField[]): Map<string, FieldValidation> {
  const byPath = new Map<string, WorkingField>();
  const values = new Map<string, unknown | null>();
  for (const f of fields) {
    byPath.set(f.path, f);
    values.set(f.path, effectiveValue(f));
  }

  const result = new Map<string, FieldValidation>();
  for (const f of fields) {
    result.set(f.id, validateSingle(f, values.get(f.path) ?? null));
  }

  // Line-item math: quantity * unitPrice should equal lineTotal.
  const lineIndexes = new Set<number>();
  for (const f of fields) {
    const m = LINE_PATH.exec(f.path);
    if (m) lineIndexes.add(Number(m[1]));
  }
  let anyLineIssue = false;
  for (const idx of lineIndexes) {
    const qtyF = byPath.get(`lineItems[${idx}].quantity`);
    const unitF = byPath.get(`lineItems[${idx}].unitPrice`);
    const totalF = byPath.get(`lineItems[${idx}].lineTotal`);
    if (!qtyF || !unitF || !totalF) continue;
    const qty = asString(values.get(qtyF.path) ?? null);
    const unit = asString(values.get(unitF.path) ?? null);
    const total = asString(values.get(totalF.path) ?? null);
    if (!qty || !unit || !total) continue;
    if (![qty, unit, total].every(isDecimalString)) continue;
    const expected = mulScaled(toScaled(qty), toScaled(unit));
    if (!equalsCents(expected, toScaled(total))) {
      anyLineIssue = true;
      const existing = result.get(totalF.id);
      // Only downgrade to warning if not already a hard type error.
      if (!existing || existing.state !== "invalid") {
        result.set(totalF.id, {
          state: "warning",
          issues: [
            {
              severity: "warning",
              message: `${qty} x ${normalizeDecimal(unit)} = ${normalizeDecimal(
                (Number(qty) * Number(unit)).toString(),
              )}, but ${normalizeDecimal(total)} was recorded.`,
            },
          ],
        });
      }
    }
  }

  // Subtotal integrity note when a line looks mispriced.
  const subtotalF = byPath.get("subtotal");
  if (subtotalF && anyLineIssue) {
    const existing = result.get(subtotalF.id);
    if (!existing || existing.state === "valid") {
      result.set(subtotalF.id, {
        state: "warning",
        issues: [
          { severity: "warning", message: "One or more line totals look mispriced; verify the subtotal." },
        ],
      });
    }
  }

  // subtotal + tax = total.
  const taxF = byPath.get("tax");
  const totalF = byPath.get("total");
  if (subtotalF && taxF && totalF) {
    const sub = asString(values.get("subtotal") ?? null);
    const tax = asString(values.get("tax") ?? null);
    const total = asString(values.get("total") ?? null);
    if (sub && tax && total && [sub, tax, total].every(isDecimalString)) {
      const expected = addScaled(toScaled(sub), toScaled(tax));
      if (!equalsCents(expected, toScaled(total))) {
        const existing = result.get(totalF.id);
        if (!existing || existing.state !== "invalid") {
          result.set(totalF.id, {
            state: "warning",
            issues: [
              {
                severity: "warning",
                message: `Subtotal + tax (${normalizeDecimal(
                  (Number(sub) + Number(tax)).toString(),
                )}) does not equal the total (${normalizeDecimal(total)}).`,
              },
            ],
          });
        }
      }
    }
  }

  return result;
}

/** Cross-field reconciliation warnings and hard validation errors need resolution. */
function validationNeedsResolution(validation: FieldValidation): boolean {
  return validation.state === "invalid" || validation.state === "warning";
}

/** A field needs a human decision when confidence is not high or it fails validation. */
export function computeNeedsAttention(field: WorkingField, validation: FieldValidation): boolean {
  if (field.reviewState === "confirmed" || field.reviewState === "not_applicable") {
    // Explicit confirm / N/A acknowledges reconciliation warnings; type errors still block.
    return validation.state === "invalid";
  }
  if (field.reviewState === "corrected") {
    return validationNeedsResolution(validation);
  }
  return field.confidenceState !== "high" || validationNeedsResolution(validation);
}

/** Blockers that prevent approval until required/material fields are reviewed or acknowledged. */
export function approvalBlockers(
  fields: WorkingField[],
  validations: Map<string, FieldValidation>,
): ApprovalBlocker[] {
  const blockers: ApprovalBlocker[] = [];
  for (const f of fields) {
    const v = validations.get(f.id);
    if (v && v.state === "invalid") {
      blockers.push({
        fieldId: f.id,
        path: f.path,
        message: v.issues[0]?.message ?? `${f.label} is invalid.`,
      });
      continue;
    }
    const attention = computeNeedsAttention(f, v ?? { state: "not_checked", issues: [] });
    if (attention && (f.required || f.material)) {
      blockers.push({
        fieldId: f.id,
        path: f.path,
        message:
          v?.state === "warning" && v.issues[0]?.message
            ? v.issues[0].message
            : `${f.label} needs your review before approval.`,
      });
    }
  }
  return blockers;
}

export function docReviewStatus(blockers: ApprovalBlocker[]): "needs_review" | "ready" {
  return blockers.length === 0 ? "ready" : "needs_review";
}

export function reviewProgress(
  fields: WorkingField[],
  validations: Map<string, FieldValidation>,
): { totalAttentionFields: number; resolvedAttentionFields: number } {
  let total = 0;
  let resolved = 0;
  for (const f of fields) {
    const v = validations.get(f.id) ?? { state: "not_checked" as ValidationState, issues: [] };
    const userResolved =
      f.reviewState === "confirmed" || f.reviewState === "corrected" || f.reviewState === "not_applicable";
    const openNow = computeNeedsAttention(f, v);
    if (userResolved || openNow) {
      total += 1;
      if (userResolved && !openNow) resolved += 1;
    }
  }
  return { totalAttentionFields: total, resolvedAttentionFields: resolved };
}
