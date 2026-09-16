import type {
  ApprovalBlocker,
  ConfidenceState,
  FieldType,
  ReviewFieldState,
  ValidationIssue,
  ValidationState,
} from "@invoice/contracts";
import { isDecimalString } from "./money.js";
import { RULE_REGISTRY } from "./rules.js";

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
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/u;
const CURRENCY = /^[A-Z]{3}$/u;
const INTEGER = /^-?\d+$/u;

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
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
    case "datetime":
      if (!str || !ISO_DATETIME.test(str)) {
        return { state: "invalid", issues: [{ severity: "error", message: "Enter a valid date/time." }] };
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
    case "integer":
      if (!str || !INTEGER.test(str)) {
        return { state: "invalid", issues: [{ severity: "error", message: "Enter a whole number." }] };
      }
      return { state: "valid", issues: [] };
    case "boolean":
      if (typeof value !== "boolean" && !/^(true|false|yes|no)$/iu.test(str ?? "")) {
        return { state: "invalid", issues: [{ severity: "error", message: "Enter true or false." }] };
      }
      return { state: "valid", issues: [] };
    default:
      return { state: "valid", issues: [] };
  }
}

/**
 * Validates every field: generic type/presence checks always run, then any
 * schema-declared cross-field rules (e.g. invoice reconciliation) are applied.
 * `ruleKeys` come from the schema the extraction was produced against, so
 * generic documents (which declare no rules) never trigger invoice math.
 * Returns a map keyed by field id.
 */
export function validateFields(
  fields: WorkingField[],
  ruleKeys: string[] = [],
): Map<string, FieldValidation> {
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

  for (const key of ruleKeys) {
    const rule = RULE_REGISTRY[key];
    if (rule) rule({ fields, byPath, values, result });
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
