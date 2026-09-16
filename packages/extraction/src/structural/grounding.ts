import type { CanonicalParse, CanonicalTable } from "../canonical.js";
import type { ResolvedSpan } from "../interfaces.js";

/** Map a character offset to its 1-based page using the parse's blocks. */
function pageForOffset(parse: CanonicalParse, offset: number): number | null {
  if (parse.sourceKind !== "pdf") return null;
  let page: number | null = null;
  for (const block of parse.blocks) {
    if (block.page == null) continue;
    if (offset >= block.offsetStart) page = block.page;
    else break;
  }
  return page;
}

function normalizeForMatch(s: string): string {
  return s.replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * Quote-then-resolve grounding. Given a verbatim quote returned by an
 * extractor, locate it in the canonical text to derive half-open offsets and a
 * page. We never trust model-supplied coordinates; unresolved quotes are kept
 * visible with `groundingStatus: "unresolved"`.
 */
export function resolveQuote(parse: CanonicalParse, quote: string): ResolvedSpan {
  const q = quote.trim();
  if (q.length === 0) {
    return { offsetStart: 0, offsetEnd: 0, page: null, groundingStatus: "none", quote };
  }

  // 1. Exact substring match.
  let idx = parse.text.indexOf(q);
  if (idx >= 0) {
    return {
      offsetStart: idx,
      offsetEnd: idx + q.length,
      page: pageForOffset(parse, idx),
      groundingStatus: "grounded",
      quote,
    };
  }

  // 2. Whitespace-insensitive match against a normalized index.
  const normText = normalizeForMatch(parse.text);
  const normQuote = normalizeForMatch(q);
  const normIdx = normText.indexOf(normQuote);
  if (normIdx >= 0) {
    // Walk the original text to translate the normalized offset back.
    const start = translateNormalizedOffset(parse.text, normIdx);
    const end = translateNormalizedOffset(parse.text, normIdx + normQuote.length);
    if (start >= 0 && end > start) {
      return {
        offsetStart: start,
        offsetEnd: end,
        page: pageForOffset(parse, start),
        groundingStatus: "grounded",
        quote,
      };
    }
  }

  return { offsetStart: 0, offsetEnd: 0, page: null, groundingStatus: "unresolved", quote };
}

/**
 * Translate an offset in the whitespace-normalized string back to an offset in
 * the original text. Walks both cursors in lockstep.
 */
function translateNormalizedOffset(original: string, normOffset: number): number {
  let normCursor = 0;
  let inSpace = false;
  for (let i = 0; i < original.length; i += 1) {
    if (normCursor === normOffset) return i;
    const ch = original[i]!;
    if (/\s/u.test(ch)) {
      if (!inSpace) {
        // A run of whitespace collapses to a single space in the normalized form,
        // but the normalized string is also trimmed at the ends.
        if (normCursor > 0) normCursor += 1;
        inSpace = true;
      }
    } else {
      normCursor += 1;
      inSpace = false;
    }
  }
  return normCursor >= normOffset ? original.length : -1;
}

/** Build a span directly from known offsets (used by the structural extractor). */
export function spanFromOffsets(
  parse: CanonicalParse,
  offsetStart: number,
  offsetEnd: number,
): ResolvedSpan {
  return {
    offsetStart,
    offsetEnd,
    page: pageForOffset(parse, offsetStart),
    groundingStatus: "grounded",
    quote: parse.text.slice(offsetStart, offsetEnd),
  };
}

/**
 * Resolve one table cell, never the whole table. New parses carry exact cell
 * spans; the line-based fallback keeps older stored canonical parses precise.
 */
export function spanForTableCell(
  parse: CanonicalParse,
  table: CanonicalTable,
  rowIndex: number,
  columnIndex: number,
): ResolvedSpan {
  const known = table.cellSpans?.[rowIndex]?.[columnIndex];
  if (known) return spanFromOffsets(parse, known.offsetStart, known.offsetEnd);

  const tableText = parse.text.slice(table.offsetStart, table.offsetEnd);
  const lines = tableText.split("\n");
  const line = lines[rowIndex + 1];
  const row = table.rows[rowIndex];
  if (line !== undefined && row) {
    let cursor = 0;
    for (let index = 0; index <= columnIndex; index += 1) {
      const cell = (row[index] ?? "").trim();
      if (!cell) continue;
      const relative = line.indexOf(cell, cursor);
      if (relative < 0) break;
      if (index === columnIndex) {
        const precedingLength = lines.slice(0, rowIndex + 1).reduce(
          (total, value) => total + value.length + 1,
          0,
        );
        const offsetStart = table.offsetStart + precedingLength + relative;
        return spanFromOffsets(parse, offsetStart, offsetStart + cell.length);
      }
      cursor = relative + cell.length;
    }
  }

  const value = (row?.[columnIndex] ?? "").trim();
  return {
    offsetStart: 0,
    offsetEnd: 0,
    page: null,
    groundingStatus: "unresolved",
    quote: value,
  };
}
