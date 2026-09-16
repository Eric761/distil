import {
  DEFAULT_PAGE,
  PARSER_VERSION,
  type CanonicalBlock,
  type CanonicalParse,
  type CanonicalTable,
  type KeyValue,
  type PageMeta,
  type SourceKind,
} from "../canonical.js";

interface LineSpan {
  text: string;
  start: number;
  end: number;
}

/** Split text into lines, preserving exact half-open [start,end) offsets. */
function splitLines(text: string): LineSpan[] {
  const spans: LineSpan[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || text[i] === "\n") {
      spans.push({ text: text.slice(start, i), start, end: i });
      start = i + 1;
    }
  }
  return spans;
}

const HEADING_MD = /^(#{1,6})\s+(.*\S)\s*$/u;
const KV = /^\s*([A-Za-z][A-Za-z0-9 ./&()_-]{0,48}?)\s*[:\uFF1A]\s+(.+\S)\s*$/u;
const LIST_ITEM = /^\s*(?:[-*\u2022]|\d+[.)])\s+(.+\S)\s*$/u;
const MULTISPACE = /\S {2,}\S|\t/u;

function isHeadingLike(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 64) return false;
  if (/[.!?,;:]$/u.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/gu, "");
  if (letters.length < 2) return false;
  const upper = t === t.toUpperCase() && /[A-Z]/u.test(t);
  const titleWords = t.split(/\s+/u);
  const titleCase =
    titleWords.length <= 8 &&
    titleWords.every((w) => /^[^a-z]*[A-Z0-9]/u.test(w) || w.length <= 3);
  return upper || titleCase;
}

/** Detect a table region from consecutive whitespace/pipe-delimited rows. */
function splitCells(line: string): string[] {
  if (line.includes("|")) {
    return line
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => !(i === 0 && arr[0] === "") && !(i === arr.length - 1 && arr[arr.length - 1] === ""));
  }
  return line
    .split(/\s{2,}|\t+/u)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function looksTabular(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  if (/^[-=|+\s]+$/u.test(t)) return false; // markdown separator row
  if (t.includes("|") && splitCells(t).length >= 2) return true;
  return MULTISPACE.test(line) && splitCells(line).length >= 2;
}

/** Resolve trimmed cells left-to-right within one canonical table line. */
function cellSpans(
  line: LineSpan,
  cells: string[],
): Array<{ offsetStart: number; offsetEnd: number } | null> {
  const spans: Array<{ offsetStart: number; offsetEnd: number } | null> = [];
  let cursor = 0;
  for (const rawCell of cells) {
    const cell = rawCell.trim();
    if (!cell) {
      spans.push(null);
      continue;
    }
    const relative = line.text.indexOf(cell, cursor);
    if (relative < 0) {
      spans.push(null);
      continue;
    }
    spans.push({
      offsetStart: line.start + relative,
      offsetEnd: line.start + relative + cell.length,
    });
    cursor = relative + cell.length;
  }
  return spans;
}

export interface AnalyzeOptions {
  sourceKind: SourceKind;
  pages: PageMeta[];
  /** Maps a character offset to a 1-based page (PDFs); null for reflowable text. */
  pageAt?: (offset: number) => number | null;
  /** Pre-detected tables (e.g. from a CSV parser). */
  preTables?: CanonicalTable[];
  notes?: string[];
}

/**
 * Convert canonical plain text into reading-ordered blocks, key/value pairs,
 * and tables. Headings, paragraphs, and list items are retained as blocks for
 * narrative section extraction in the structural pass. Format-specific parsers
 * only produce canonical text (and page map).
 */
export function analyze(text: string, opts: AnalyzeOptions): CanonicalParse {
  const pageAt = opts.pageAt ?? (() => null);
  const lines = splitLines(text);

  const blocks: CanonicalBlock[] = [];
  const keyValues: KeyValue[] = [];
  const tables: CanonicalTable[] = [...(opts.preTables ?? [])];

  let tableBuf: LineSpan[] = [];
  const flushTable = () => {
    if (tableBuf.length < 2) {
      // Not enough rows to be a table; emit as plain lines.
      for (const ln of tableBuf) {
        if (ln.text.trim().length > 0) {
          blocks.push({ kind: "line", text: ln.text.trim(), offsetStart: ln.start, offsetEnd: ln.end, level: null, page: pageAt(ln.start) });
        }
      }
      tableBuf = [];
      return;
    }
    const rows = tableBuf.map((ln) => splitCells(ln.text));
    const rowSpans = tableBuf.map((ln, index) => cellSpans(ln, rows[index]!));
    const width = Math.max(...rows.map((r) => r.length));
    const headers = rows[0]!.concat(Array(Math.max(0, width - rows[0]!.length)).fill(""));
    const bodyRows = rows.slice(1).map((r) => r.concat(Array(Math.max(0, width - r.length)).fill("")));
    tables.push({
      headers,
      rows: bodyRows,
      cellSpans: rowSpans
        .slice(1)
        .map((spans) => spans.concat(Array(Math.max(0, width - spans.length)).fill(null))),
      offsetStart: tableBuf[0]!.start,
      offsetEnd: tableBuf[tableBuf.length - 1]!.end,
      page: pageAt(tableBuf[0]!.start),
    });
    for (const ln of tableBuf) {
      blocks.push({ kind: "table-row", text: ln.text.trim(), offsetStart: ln.start, offsetEnd: ln.end, level: null, page: pageAt(ln.start) });
    }
    tableBuf = [];
  };

  for (const line of lines) {
    const raw = line.text;
    const trimmed = raw.trim();

    if (looksTabular(raw)) {
      tableBuf.push(line);
      continue;
    }
    if (tableBuf.length > 0) flushTable();

    if (trimmed.length === 0) continue;

    const mdHeading = HEADING_MD.exec(raw);
    if (mdHeading) {
      const label = mdHeading[2]!;
      const labelStart = line.start + raw.indexOf(label);
      blocks.push({ kind: "heading", text: label, offsetStart: labelStart, offsetEnd: labelStart + label.length, level: mdHeading[1]!.length, page: pageAt(line.start) });
      continue;
    }

    const kv = KV.exec(raw);
    if (kv) {
      const key = kv[1]!.trim();
      const value = kv[2]!.trim();
      const valueStart = line.start + raw.lastIndexOf(value);
      blocks.push({ kind: "kv", text: `${key}: ${value}`, offsetStart: line.start, offsetEnd: line.end, level: null, page: pageAt(line.start) });
      keyValues.push({ key, value, valueOffsetStart: valueStart, valueOffsetEnd: valueStart + value.length, page: pageAt(valueStart) });
      continue;
    }

    const list = LIST_ITEM.exec(raw);
    if (list) {
      blocks.push({ kind: "list-item", text: list[1]!, offsetStart: line.start, offsetEnd: line.end, level: null, page: pageAt(line.start) });
      continue;
    }

    if (isHeadingLike(trimmed)) {
      const s = line.start + raw.indexOf(trimmed);
      blocks.push({ kind: "heading", text: trimmed, offsetStart: s, offsetEnd: s + trimmed.length, level: 2, page: pageAt(s) });
      continue;
    }

    const s = line.start + raw.indexOf(trimmed);
    blocks.push({ kind: "paragraph", text: trimmed, offsetStart: s, offsetEnd: s + trimmed.length, level: null, page: pageAt(s) });
  }
  if (tableBuf.length > 0) flushTable();

  return {
    sourceKind: opts.sourceKind,
    text,
    blocks,
    keyValues,
    tables,
    pages: opts.pages.length > 0 ? opts.pages : [DEFAULT_PAGE],
    parserVersion: PARSER_VERSION,
    notes: opts.notes ?? [],
  };
}
