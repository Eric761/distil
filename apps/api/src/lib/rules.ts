import { addScaled, equalsCents, isDecimalString, mulScaled, normalizeDecimal, toScaled } from "./money.js";
import type { FieldValidation, WorkingField } from "./validation.js";

/**
 * Cross-field validation rules. Rules are allowlisted by key and referenced by
 * a schema (e.g. the built-in invoice schema declares "invoiceReconciliation").
 * Generic documents use only generic, allowlisted structural rules; invoice
 * reconciliation never runs unless the invoice schema declares it.
 */
export interface RuleContext {
  fields: WorkingField[];
  byPath: Map<string, WorkingField>;
  values: Map<string, unknown | null>;
  result: Map<string, FieldValidation>;
}

export type ValidationRule = (ctx: RuleContext) => void;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const LINE_PATH = /^lineItems\[(\d+)\]\.(description|quantity|unitPrice|lineTotal)$/u;

/**
 * Invoice reconciliation: line total math (qty * unitPrice = lineTotal),
 * subtotal integrity, and subtotal + tax = total. Ported verbatim from the
 * original hardcoded validator; now declared by the invoice schema's rules.
 */
export const invoiceReconciliation: ValidationRule = ({ fields, byPath, values, result }) => {
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
};

function fieldValue(ctx: RuleContext, field: WorkingField): string | null {
  return asString(ctx.values.get(field.path) ?? null);
}

function markWarning(result: Map<string, FieldValidation>, field: WorkingField, message: string): void {
  const existing = result.get(field.id);
  if (existing?.state === "invalid") return;
  result.set(field.id, { state: "warning", issues: [{ severity: "warning", message }] });
}

const START_DATE = /\b(start|begin|effective|from).*date\b|\bstart(date)?\b/u;
const END_DATE = /\b(end|target|due|renewal|expiry|expiration|to).*date\b|\b(due|target|end)(date)?\b/u;

/** Generic date sanity: common end/target/due dates should not precede starts. */
export const genericDateOrder: ValidationRule = (ctx) => {
  const dateFields = ctx.fields.filter((field) => field.type === "date" || field.type === "datetime");
  const starts = dateFields.filter((field) => START_DATE.test(field.path.toLowerCase()) || START_DATE.test(field.label.toLowerCase()));
  const ends = dateFields.filter((field) => END_DATE.test(field.path.toLowerCase()) || END_DATE.test(field.label.toLowerCase()));
  for (const start of starts) {
    const startValue = fieldValue(ctx, start);
    if (!startValue) continue;
    for (const end of ends) {
      if (start.id === end.id) continue;
      const endValue = fieldValue(ctx, end);
      if (!endValue || endValue >= startValue) continue;
      markWarning(ctx.result, end, `${end.label} is before ${start.label}; verify the date order.`);
    }
  }
};

/** Generic repeated-record check: material table cells left empty need review. */
export const genericTableCompleteness: ValidationRule = (ctx) => {
  for (const field of ctx.fields) {
    if (!field.material || !/^.+\[\d+\]\..+$/u.test(field.path)) continue;
    const value = ctx.values.get(field.path) ?? null;
    if (value !== null && value !== undefined && value !== "") continue;
    markWarning(ctx.result, field, `${field.label} is empty in a repeated record; verify this row.`);
  }
};

export const RULE_REGISTRY: Record<string, ValidationRule> = {
  genericDateOrder,
  genericTableCompleteness,
  invoiceReconciliation,
};

/** Resolve the declared rule keys for a schema family. */
export function rulesForSchema(schemaKey: string | null | undefined): string[] {
  if (schemaKey === "invoice") return ["invoiceReconciliation"];
  if (schemaKey) return ["genericDateOrder", "genericTableCompleteness"];
  return [];
}
