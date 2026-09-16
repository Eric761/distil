import { asc, eq } from "drizzle-orm";
import type { DocumentEventKind, DocumentHistoryResponse } from "@invoice/contracts";
import { getDb } from "../db/client.js";
import { documentEvents, documents } from "../db/schema.js";
import { notFound } from "../lib/errors.js";

/** The immutable lineage of a document: uploads, extractions, corrections,
 * approvals, and reopens, in chronological order. */
export async function getDocumentHistory(documentId: string): Promise<DocumentHistoryResponse> {
  const db = getDb();
  const [doc] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw notFound("Document not found.");

  const rows = await db
    .select()
    .from(documentEvents)
    .where(eq(documentEvents.documentId, documentId))
    .orderBy(asc(documentEvents.createdAt));

  return {
    events: rows.map((r) => ({
      id: r.id,
      kind: r.kind as DocumentEventKind,
      summary: r.summary,
      actor: r.actor,
      extractionId: r.extractionId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
