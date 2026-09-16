import { z } from "zod";

/**
 * A single event in a document's immutable lineage: processing attempts,
 * extraction promotions, corrections, schema reassignments, approvals, and
 * reopens. Powers the History drill-in. `actor` stays null until auth exists.
 */
export const documentEventKind = z.enum([
  "uploaded",
  "processed",
  "extraction_created",
  "extraction_promoted",
  "corrected",
  "schema_reassigned",
  "approved",
  "reopened",
  "reprocessed",
]);
export type DocumentEventKind = z.infer<typeof documentEventKind>;

export const documentEvent = z.object({
  id: z.string().uuid(),
  kind: documentEventKind,
  summary: z.string(),
  actor: z.string().nullable(),
  extractionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type DocumentEvent = z.infer<typeof documentEvent>;

export const documentHistoryResponse = z.object({
  events: z.array(documentEvent),
});
export type DocumentHistoryResponse = z.infer<typeof documentHistoryResponse>;
