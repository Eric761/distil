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
const KV_KEY_WORD_ALLOW = new Set([
  "no",
  "id",
  "po",
  "gstin",
  "igst",
  "sgst",
  "cgst",
  "hsn",
  "pin",
  "ifsc",
  "upi",
  "sku",
  "qty",
  "uom",
  "irn",
  "ack",
]);
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

function isLabelKey(key: string): boolean {
  const words = key.trim().split(/\s+/u);
  if (words.length === 0) return false;
  return words.every(
    (word) =>
      /^[A-Za-z][A-Za-z.&()-]*$/u.test(word) &&
      (word.length >= 3 || KV_KEY_WORD_ALLOW.has(word.toLowerCase())),
  );
}

function findNextKey(
  raw: string,
  from: number,
  requireAtFrom = false,
): { key: string; keyStart: number; valueStart: number } | null {
  let searchFrom = from;
  while (searchFrom < raw.length) {
    const slice = raw.slice(searchFrom);
    const match = /^([A-Za-z][A-Za-z0-9 ./&()_-]{0,48}?)\s*[:\uFF1A]\s+/u.exec(slice);
    if (!match) {
      if (requireAtFrom && searchFrom === from) return null;
      const nextSpace = raw.indexOf(" ", searchFrom + 1);
      searchFrom = nextSpace >= 0 ? nextSpace + 1 : raw.length;
      continue;
    }

    const key = match[1]!.trim();
    const keyStart = searchFrom + match.index!;
    if (!isLabelKey(key)) {
      const nextSpace = raw.indexOf(" ", keyStart + 1);
      searchFrom = nextSpace >= 0 ? nextSpace + 1 : raw.length;
      continue;
    }

    if (keyStart > from) {
      const before = raw[keyStart - 1];
      if (before !== " " && before !== "\t") {
        searchFrom = keyStart + 1;
        continue;
      }
    }

    return { key, keyStart, valueStart: keyStart + match[0].length };
  }
  return null;
}

/** Extract one or more key/value pairs when a line starts with `Label: value`. */
function extractKeyValuesFromLine(
  raw: string,
  lineStart: number,
  pageAt: (offset: number) => number | null,
): KeyValue[] | null {
  const contentStart = raw.search(/\S/u);
  if (contentStart < 0) return null;

  const first = findNextKey(raw, contentStart, true);
  if (!first || first.keyStart !== contentStart) return null;

  const pairs: KeyValue[] = [];
  let current: { key: string; keyStart: number; valueStart: number } | null = first;
  while (current) {
    const next = findNextKey(raw, current.valueStart);
    const valueEndInRaw = next?.keyStart ?? raw.length;

    const valueRegion = raw.slice(current.valueStart, valueEndInRaw);
    const value = valueRegion.trim();
    if (value.length > 0) {
      const leading = valueRegion.length - valueRegion.trimStart().length;
      const valueOffsetStart = lineStart + current.valueStart + leading;
      const valueOffsetEnd = valueOffsetStart + value.length;

      pairs.push({
        key: current.key,
        value,
        valueOffsetStart,
        valueOffsetEnd,
        page: pageAt(valueOffsetStart),
      });
    }

    current = next;
  }

  return pairs.length > 0 ? pairs : null;
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

    const kvs = extractKeyValuesFromLine(raw, line.start, pageAt);
    if (kvs) {
      blocks.push({
        kind: "kv",
        text: kvs.map((kv) => `${kv.key}: ${kv.value}`).join("  "),
        offsetStart: line.start,
        offsetEnd: line.end,
        level: null,
        page: pageAt(line.start),
      });
      keyValues.push(...kvs);
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
