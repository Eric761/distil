import type { FieldType } from "@invoice/contracts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const US_DATE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/u;
const CURRENCY_CODE = /^[A-Z]{3}$/u;
const INTEGER = /^-?\d{1,15}$/u;
const DECIMAL = /^-?\$?\u20ac?\u00a3?\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/u;
const BOOLEAN = /^(true|false|yes|no)$/iu;

/** Convert an arbitrary label into a stable, safe field key segment. */
export function slugKey(label: string): string {
  const cleaned = label
    .trim()
    .replace(/[^A-Za-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/u);
  if (cleaned.length === 0 || cleaned[0] === "") return "field";
  return cleaned
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join("")
    .slice(0, 48);
}

/** Human-friendly label from a raw key ("invoice_number" -> "Invoice number"). */
export function humanizeLabel(raw: string): string {
  const spaced = raw
    .replace(/[_-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/\s+/gu, " ")
    .trim();
  if (spaced.length === 0) return raw;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Deterministically infer a field type from a sample string value. */
export function inferType(value: string): FieldType {
  const v = value.trim();
  if (v.length === 0) return "string";
  if (CURRENCY_CODE.test(v)) return "currency";
  if (ISO_DATE.test(v) || US_DATE.test(v)) return "date";
  if (BOOLEAN.test(v)) return "boolean";
  if (INTEGER.test(v.replace(/,/gu, ""))) return "integer";
  if (/[$\u20ac\u00a3]/u.test(v) && DECIMAL.test(v)) return "currency";
  if (DECIMAL.test(v)) return "decimal";
  if (v.length > 120) return "text";
  return "string";
}

/** Infer the dominant type across a column of sample values. */
export function inferColumnType(values: string[]): FieldType {
  const counts = new Map<FieldType, number>();
  let seen = 0;
  for (const raw of values) {
    if (raw.trim().length === 0) continue;
    seen += 1;
    const t = inferType(raw);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (seen === 0) return "string";
  let best: FieldType = "string";
  let bestCount = -1;
  for (const [t, c] of counts) {
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  // Only trust a numeric/date column when it's overwhelmingly that type.
  if ((best === "decimal" || best === "integer" || best === "date" || best === "currency") && bestCount / seen < 0.6) {
    return "string";
  }
  return best;
}

/**
 * Normalize a raw string into a typed value for storage in the typed index.
 * Returns null when the value cannot be represented in the target type.
 */
export function normalizeValue(type: FieldType, raw: unknown): unknown | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (v.length === 0) return null;
  switch (type) {
    case "integer": {
      const n = v.replace(/,/gu, "");
      return INTEGER.test(n) ? n : v;
    }
    case "decimal":
    case "currency": {
      const cleaned = v.replace(/[$\u20ac\u00a3,\s]/gu, "");
      if (type === "currency" && CURRENCY_CODE.test(v)) return v;
      return /^-?\d+(?:\.\d+)?$/u.test(cleaned) ? cleaned : v;
    }
    case "date":
      return v;
    case "boolean":
      return /^(true|yes)$/iu.test(v) ? "true" : /^(false|no)$/iu.test(v) ? "false" : v;
    default:
      return v;
  }
}
