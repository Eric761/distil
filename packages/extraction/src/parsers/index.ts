import type { CanonicalParse } from "../canonical.js";
import { parseCsv } from "./csv.js";
import { ParseError } from "./errors.js";
import { parseHtml } from "./html.js";
import { parsePdf } from "./pdf.js";
import { parsePlainText } from "./text.js";

export type SupportedFormat = "pdf" | "txt" | "markdown" | "csv" | "html";

const EXT_FORMAT: Record<string, SupportedFormat> = {
  pdf: "pdf",
  txt: "txt",
  text: "txt",
  md: "markdown",
  markdown: "markdown",
  mdown: "markdown",
  csv: "csv",
  tsv: "csv",
  html: "html",
  htm: "html",
};

const MIME_FORMAT: Record<string, SupportedFormat> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "markdown",
  "text/csv": "csv",
  "text/tab-separated-values": "csv",
  "text/html": "html",
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/** Resolve the supported format from filename + MIME, or null if unsupported. */
export function detectFormat(filename: string, mime?: string): SupportedFormat | null {
  const byExt = EXT_FORMAT[extensionOf(filename)];
  if (byExt) return byExt;
  if (mime) {
    const m = mime.toLowerCase().split(";")[0]!.trim();
    if (MIME_FORMAT[m]) return MIME_FORMAT[m]!;
  }
  return null;
}

/** Decode text-format bytes as UTF-8, rejecting obviously-binary payloads. */
function decodeUtf8(bytes: Uint8Array): string {
  // Reject if there are NUL bytes in the first chunk (binary content).
  const probe = bytes.subarray(0, Math.min(bytes.length, 4096));
  let nulls = 0;
  for (const b of probe) if (b === 0) nulls += 1;
  if (nulls > 1) {
    throw new ParseError("UNSUPPORTED_FILE", "This file looks binary, not text.");
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export interface ParseInput {
  bytes: Uint8Array;
  filename: string;
  mime?: string;
}

/**
 * Parse any supported document into the canonical representation. This is the
 * single entry point used by the API worker for non-fixture documents.
 */
export async function parseDocument(input: ParseInput): Promise<CanonicalParse> {
  const format = detectFormat(input.filename, input.mime);
  if (!format) {
    throw new ParseError(
      "UNSUPPORTED_FILE",
      "Unsupported file type. Supported: PDF, TXT, Markdown, CSV, HTML.",
    );
  }

  let parse: CanonicalParse;
  if (format === "pdf") {
    parse = await parsePdf(input.bytes);
  } else {
    const text = decodeUtf8(input.bytes);
    if (text.replace(/\s+/gu, "").length === 0) {
      throw new ParseError("EMPTY_DOCUMENT", "This document appears to be empty.");
    }
    parse =
      format === "csv" ? parseCsv(text) : format === "html" ? parseHtml(text) : parsePlainText(text);
  }

  if (parse.text.replace(/\s+/gu, "").length === 0) {
    throw new ParseError("EMPTY_DOCUMENT", "No readable text could be extracted.");
  }
  return parse;
}

export { ParseError } from "./errors.js";
export type { ParseErrorCode } from "./errors.js";
