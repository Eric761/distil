import { DEFAULT_PAGE, type CanonicalParse, type PageMeta } from "../canonical.js";
import { analyze } from "./analyze.js";
import { ParseError } from "./errors.js";
import { normalizeText } from "./text.js";

const PAGE_SEPARATOR = "\n\n";

interface PdfViewport {
  width: number;
  height: number;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface PdfPageProxy {
  getViewport(args: { scale: number }): PdfViewport;
  getTextContent(): Promise<{ items: unknown[] }>;
}

interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as { str?: unknown }).str === "string" &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function appendItemText(lineText: string, item: PositionedTextItem, previousEnd: number | null): string {
  const gap = previousEnd == null ? 0 : item.x - previousEnd;
  let text = lineText;
  if (text && !/\s$/u.test(text) && gap > Math.max(1.5, item.height * 0.15)) {
    text += " ";
  }
  return text + item.str;
}

function itemsToLineText(lineItems: PositionedTextItem[]): string {
  const sorted = [...lineItems].sort((a, b) => a.x - b.x);
  let text = "";
  let previousEnd: number | null = null;
  for (const item of sorted) {
    text = appendItemText(text, item, previousEnd);
    previousEnd = item.x + item.width;
  }
  return text.replace(/[ \t]+/gu, " ").trim();
}

/**
 * Rebuild page text from the PDF text layer in visual line order. Resume PDFs
 * often place wrapped continuations on the same text baseline with a reset X
 * position; clustering only by Y merges those into one canonical line.
 */
export function textLayerToLines(items: unknown[]): string {
  const positioned = items
    .filter(isPdfTextItem)
    .map<PositionedTextItem & { hasEOL: boolean }>((item) => ({
      str: item.str,
      x: Number(item.transform[4] ?? 0),
      y: Number(item.transform[5] ?? 0),
      width: item.width ?? 0,
      height: item.height ?? 0,
      hasEOL: item.hasEOL === true,
    }))
    .filter((item) => item.str.trim().length > 0);

  const sorted = positioned.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedTextItem[][] = [];
  let current: PositionedTextItem[] = [];
  let currentY: number | null = null;
  let previousEnd: number | null = null;
  let lineStartX: number | null = null;

  const flush = () => {
    if (current.length > 0) lines.push(current);
    current = [];
    currentY = null;
    previousEnd = null;
    lineStartX = null;
  };

  for (const item of sorted) {
    const tolerance = Math.max(2, item.height * 0.45);
    const sameBaseline = currentY != null && Math.abs(currentY - item.y) <= tolerance;
    const continuesHorizontally =
      sameBaseline && previousEnd != null && item.x >= previousEnd - Math.max(2, item.height * 0.25);
    const wrappedToNextLine =
      sameBaseline &&
      current.length > 0 &&
      lineStartX != null &&
      item.x <= lineStartX + Math.max(4, item.height * 0.5) &&
      previousEnd != null &&
      item.x < previousEnd - Math.max(6, item.height * 0.35);

    if (current.length === 0) {
      current = [item];
      currentY = item.y;
      lineStartX = item.x;
      previousEnd = item.x + item.width;
      if (item.hasEOL) flush();
      continue;
    }

    if ((!sameBaseline || wrappedToNextLine) && !continuesHorizontally) {
      flush();
      current = [item];
      currentY = item.y;
      lineStartX = item.x;
      previousEnd = item.x + item.width;
      if (item.hasEOL) flush();
      continue;
    }

    current.push(item);
    currentY = (currentY! * (current.length - 1) + item.y) / current.length;
    previousEnd = item.x + item.width;
    if (item.hasEOL) flush();
  }

  flush();

  return lines.map(itemsToLineText).filter(Boolean).join("\n");
}

/**
 * Text-layer PDF parser via `unpdf` (bundled pdf.js for Node). Image-only PDFs
 * (no extractable text) are explicitly out of scope and raise OCR_REQUIRED.
 *
 * Provenance for generic PDFs is page-level: we track per-page offset ranges so
 * each grounded quote resolves to a page number and canonical text span. We do
 * not fabricate bounding boxes (attribution hallucination); the authored
 * fixture invoices keep their hand-placed boxes via the FixtureExtractor path.
 */
export async function parsePdf(bytes: Uint8Array): Promise<CanonicalParse> {
  const { getDocumentProxy } = await import("unpdf");
  // pdf.js rejects Node Buffer even though Buffer extends Uint8Array. Copy the
  // exact byte window into a plain Uint8Array at the parser boundary.
  const pdfBytes = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

  const pageTexts: string[] = [];
  let totalPages: number;
  const pages: PageMeta[] = [];

  try {
    const pdf = (await getDocumentProxy(pdfBytes)) as PdfDocumentProxy;
    totalPages = pdf.numPages;
    for (let i = 1; i <= totalPages; i += 1) {
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pages.push({ page: i, widthPt: viewport.width || DEFAULT_PAGE.widthPt, heightPt: viewport.height || DEFAULT_PAGE.heightPt });
        const textContent = await page.getTextContent();
        pageTexts.push(textLayerToLines(textContent.items));
      } catch {
        pages.push({ page: i, widthPt: DEFAULT_PAGE.widthPt, heightPt: DEFAULT_PAGE.heightPt });
        pageTexts.push("");
      }
    }
  } catch (error) {
    throw new ParseError("PARSE_FAILED", `Could not read this PDF: ${(error as Error).message}`);
  }

  const normalizedPages = pageTexts.map((t) => normalizeText(t).replace(/[ \t]+\n/gu, "\n").trim());
  const joined = normalizedPages.join(PAGE_SEPARATOR);

  if (joined.replace(/\s+/gu, "").length < 8) {
    throw new ParseError(
      "OCR_REQUIRED",
      "This PDF has no extractable text layer (it looks scanned). OCR is not supported yet.",
    );
  }

  // Build offset -> page map from page boundaries in the joined text.
  const pageStarts: number[] = [];
  let cursor = 0;
  for (let i = 0; i < normalizedPages.length; i += 1) {
    pageStarts.push(cursor);
    cursor += normalizedPages[i]!.length;
    if (i < normalizedPages.length - 1) cursor += PAGE_SEPARATOR.length;
  }
  const pageAt = (offset: number): number => {
    let page = 1;
    for (let i = 0; i < pageStarts.length; i += 1) {
      if (offset >= pageStarts[i]!) page = i + 1;
      else break;
    }
    return page;
  };

  return analyze(joined, {
    sourceKind: "pdf",
    pages: pages.length > 0 ? pages : [DEFAULT_PAGE],
    pageAt,
  });
}
