import { z } from "zod";
import { sourceKind } from "./common.js";

/**
 * A block in the canonical parse. Blocks preserve reading order and carry
 * half-open UTF-16 offsets into the canonical text so the TextViewer can
 * highlight provenance without re-parsing the raw bytes.
 */
export const parseBlock = z.object({
  kind: z.enum(["heading", "paragraph", "line", "kv", "table-row", "list-item"]),
  text: z.string(),
  offsetStart: z.number().int().min(0),
  offsetEnd: z.number().int().min(0),
  /** Heading depth (1..6) for heading blocks. */
  level: z.number().int().min(1).max(6).nullable(),
  /** 1-based page for PDF-derived blocks; null for reflowable text. */
  page: z.number().int().min(1).nullable(),
});
export type ParseBlock = z.infer<typeof parseBlock>;

/**
 * The immutable canonical parse returned by GET /documents/:id/parse. The
 * source viewer renders this — never the raw executable markup (HTML is shown
 * as canonical plain text/structure only).
 */
export const documentParse = z.object({
  documentId: z.string().uuid(),
  parseId: z.string().uuid(),
  sourceKind,
  /** The full canonical plain text (offsets index into this string). */
  text: z.string(),
  blocks: z.array(parseBlock),
  pages: z.array(
    z.object({
      page: z.number().int().min(1),
      widthPt: z.number().positive(),
      heightPt: z.number().positive(),
    }),
  ),
  /** Parser/canonicalization version for reproducibility. */
  parserVersion: z.string(),
});
export type DocumentParse = z.infer<typeof documentParse>;
