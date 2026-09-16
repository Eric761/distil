import { DEFAULT_PAGE, type CanonicalParse } from "../canonical.js";
import { analyze } from "./analyze.js";
import { normalizeText } from "./text.js";

/** Minimal RFC-4180-ish CSV row parser (handles quotes and escaped quotes). */
export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const text = normalizeText(input);

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/**
 * CSV parser. Canonical text renders each row tab-delimited so the analyzer
 * detects one table; offsets stay meaningful for grounding.
 */
export function parseCsv(raw: string): CanonicalParse {
  const rows = parseCsvRows(raw);
  const text = rows.map((r) => r.map((c) => c.trim()).join("\t")).join("\n");
  return analyze(text, { sourceKind: "text", pages: [DEFAULT_PAGE] });
}
