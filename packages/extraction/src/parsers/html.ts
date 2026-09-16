import { DEFAULT_PAGE, type CanonicalParse } from "../canonical.js";
import { analyze } from "./analyze.js";
import { normalizeText } from "./text.js";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&[a-z]+;|&#39;/giu, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

/**
 * HTML is treated as UNTRUSTED input and is never rendered as same-origin
 * markup. We strip scripts/styles, convert structural tags to canonical text
 * boundaries, and drop all remaining tags — the source viewer only ever sees
 * this canonical plain text.
 */
export function parseHtml(raw: string): CanonicalParse {
  let html = normalizeText(raw);
  // Remove executable / non-content regions entirely.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ");
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ");
  html = html.replace(/<!--[\s\S]*?-->/gu, " ");
  html = html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/giu, " ");

  // Collapse insignificant whitespace between table-structural tags so rows
  // stay contiguous. Real-world HTML puts each <tr> on its own source line,
  // which would otherwise split one table into blank-line-separated rows and
  // defeat table detection.
  html = html.replace(/\s*(<\/?(?:table|thead|tbody|tfoot|tr|td|th)\b[^>]*>)\s*/giu, "$1");

  // Headings -> markdown so analyze() assigns a level.
  html = html.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu, (_, lvl: string, inner: string) => {
    const hashes = "#".repeat(Number(lvl));
    return `\n${hashes} ${inner.replace(/<[^>]+>/gu, " ").trim()}\n`;
  });
  // List items and table cells become structured lines.
  html = html.replace(/<li\b[^>]*>/giu, "\n- ");
  html = html.replace(/<\/tr>/giu, "\n");
  html = html.replace(/<t[dh]\b[^>]*>/giu, "\t");
  // Block-level elements become newlines.
  html = html.replace(/<\/(p|div|section|article|header|footer|ul|ol|table|tr|br)>/giu, "\n");
  html = html.replace(/<br\s*\/?>(?!\n)/giu, "\n");
  html = html.replace(/<(p|div|section|article|header|footer|ul|ol|table)\b[^>]*>/giu, "\n");
  // Drop everything else.
  html = html.replace(/<[^>]+>/gu, " ");
  html = decodeEntities(html);
  // Collapse runs of spaces/tabs but preserve newlines and tab column hints.
  const text = html
    .split("\n")
    .map((line) => line.replace(/[ \u00a0]{2,}/gu, " ").replace(/[ \t]+$/u, "").trimStart())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  return analyze(text, { sourceKind: "text", pages: [DEFAULT_PAGE] });
}
