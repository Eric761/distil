import { DEFAULT_PAGE, type CanonicalParse } from "../canonical.js";
import { analyze } from "./analyze.js";

/** Normalize line endings and strip a UTF-8 BOM. */
export function normalizeText(raw: string): string {
  return raw.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
}

/** Plain text / Markdown parser. Canonical text is the normalized source. */
export function parsePlainText(raw: string): CanonicalParse {
  const text = normalizeText(raw);
  return analyze(text, { sourceKind: "text", pages: [DEFAULT_PAGE] });
}
