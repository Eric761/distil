/**
 * The canonical parse is the single, immutable representation every extractor
 * and the source viewer work against. It is deliberately format-agnostic:
 * PDFs, plain text, Markdown, CSV, and HTML all reduce to canonical plain text
 * plus reading-ordered blocks with half-open UTF-16 offsets into that text.
 *
 * Offsets are the grounding substrate: the structural and LLM extractors return
 * verbatim quotes, and grounding resolves each quote to `[offsetStart,
 * offsetEnd)` in `text` (and, for PDFs, a page number).
 */

export type SourceKind = "pdf" | "text";

export type BlockKind =
  | "heading"
  | "paragraph"
  | "line"
  | "kv"
  | "table-row"
  | "list-item";

export interface CanonicalBlock {
  kind: BlockKind;
  text: string;
  /** Half-open UTF-16 offsets into CanonicalParse.text. */
  offsetStart: number;
  offsetEnd: number;
  /** Heading depth 1..6 for heading blocks. */
  level: number | null;
  /** 1-based page for PDF-derived blocks; null for reflowable text. */
  page: number | null;
}

export interface PageMeta {
  page: number;
  widthPt: number;
  heightPt: number;
}

/** A detected key/value pair, e.g. "Invoice Number: INV-42". */
export interface KeyValue {
  key: string;
  value: string;
  /** Offsets of the value span within CanonicalParse.text. */
  valueOffsetStart: number;
  valueOffsetEnd: number;
  page: number | null;
}

/** A detected tabular region (CSV, Markdown table, or whitespace columns). */
export interface CanonicalTable {
  headers: string[];
  rows: string[][];
  /** Exact source span for each body cell, indexed as [row][column]. */
  cellSpans?: Array<Array<{ offsetStart: number; offsetEnd: number } | null>>;
  /** Offsets covering the whole table region. */
  offsetStart: number;
  offsetEnd: number;
  page: number | null;
}

export interface CanonicalParse {
  sourceKind: SourceKind;
  /** Canonical plain text; all offsets index into this string. */
  text: string;
  blocks: CanonicalBlock[];
  keyValues: KeyValue[];
  tables: CanonicalTable[];
  pages: PageMeta[];
  parserVersion: string;
  /** Non-fatal notes (e.g. "PDF had no text layer"). */
  notes: string[];
}

export const PARSER_VERSION = "distil-parser.v3";

/** US Letter defaults used for reflowable text formats (one synthetic page). */
export const DEFAULT_PAGE: PageMeta = { page: 1, widthPt: 612, heightPt: 792 };
