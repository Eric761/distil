import { and, eq, ne } from "drizzle-orm";
import type {
  ConfidenceState,
  ReviewQueueIssue,
  ReviewQueueItem,
  ReviewQueueResponse,
  ValidationState,
} from "@invoice/contracts";
import { getDb } from "../db/client.js";
import { documents, extractionFields, invoiceRecords } from "../db/schema.js";

/**
 * One unresolved field row joined with its document + record context. Rows are
 * grouped by document; each document surfaces its single most important issue.
 */
interface IssueRow {
  documentId: string;
  originalFilename: string;
  processingStatus: ReviewQueueItem["processingStatus"];
  reviewStatus: ReviewQueueItem["reviewStatus"];
  vendorName: string | null;
  invoiceNumber: string | null;
  total: string | null;
  currency: string | null;
  path: string;
  label: string;
  required: boolean;
  material: boolean;
  confidenceState: ConfidenceState;
  validationState: ValidationState;
  validationIssues: Array<{ severity: "error" | "warning"; message: string }>;
}

/**
 * Materiality- and uncertainty-weighted priority for a single field. Higher is
 * more urgent. Invalid data outranks uncertainty; required/material fields are
 * boosted so the analyst clears blockers before nice-to-haves.
 */
function issuePriority(row: IssueRow): number {
  let score = 0;
  if (row.validationState === "invalid") score += 100;
  else if (row.validationState === "warning") score += 20;

  switch (row.confidenceState) {
    case "conflicting":
      score += 60;
      break;
    case "missing":
      score += 50;
      break;
    case "low":
      score += 25;
      break;
    case "inferred":
      score += 12;
      break;
    case "medium":
      score += 10;
      break;
    default:
      break;
  }

  if (row.required) score += 20;
  if (row.material) score += 15;
  return score;
}

/** Action-oriented, human summary of why a field needs attention. */
function issueMessage(row: IssueRow): string {
  if (row.validationState === "invalid") {
    const first = row.validationIssues.find((i) => i.severity === "error") ?? row.validationIssues[0];
    if (first) return first.message;
  }
  switch (row.confidenceState) {
    case "conflicting":
      return `Conflicting values found for ${row.label} — choose the correct one.`;
    case "missing":
      return row.required
        ? `${row.label} is required but was not found.`
        : `${row.label} was not found — add it if it applies.`;
    case "low":
      return `Low-confidence reading for ${row.label} — verify against the document.`;
    case "inferred":
      return `${row.label} was inferred — confirm it matches the document.`;
    case "medium":
      return `Please verify ${row.label}.`;
    default:
      if (row.validationState === "warning" && row.validationIssues[0]) {
        return row.validationIssues[0].message;
      }
      return `${row.label} needs review.`;
  }
}

/**
 * Builds the cross-document review queue: every non-approved document that has
 * at least one field still needing attention, ranked so the most consequential
 * work comes first. Deterministic ordering (priority, then open count, then
 * document id) keeps results stable across polls.
 */
export async function getReviewQueue(limit = 50): Promise<ReviewQueueResponse> {
  const db = getDb();

  const rows = (await db
    .select({
      documentId: documents.id,
      originalFilename: documents.originalFilename,
      processingStatus: documents.processingStatus,
      reviewStatus: documents.reviewStatus,
      vendorName: invoiceRecords.vendorName,
      invoiceNumber: invoiceRecords.invoiceNumber,
      total: invoiceRecords.total,
      currency: invoiceRecords.currency,
      path: extractionFields.path,
      label: extractionFields.label,
      required: extractionFields.required,
      material: extractionFields.material,
      confidenceState: extractionFields.confidenceState,
      validationState: extractionFields.validationState,
      validationIssues: extractionFields.validationIssues,
    })
    .from(extractionFields)
    .innerJoin(documents, eq(documents.currentExtractionId, extractionFields.extractionId))
    .leftJoin(invoiceRecords, eq(invoiceRecords.documentId, documents.id))
    .where(
      and(eq(extractionFields.needsAttention, true), ne(documents.reviewStatus, "approved")),
    )) as IssueRow[];

  // Group open issues per document, tracking the highest-priority one.
  const byDoc = new Map<
    string,
    { meta: IssueRow; count: number; top: IssueRow; topScore: number }
  >();

  for (const row of rows) {
    const score = issuePriority(row);
    const existing = byDoc.get(row.documentId);
    if (!existing) {
      byDoc.set(row.documentId, { meta: row, count: 1, top: row, topScore: score });
      continue;
    }
    existing.count += 1;
    if (score > existing.topScore) {
      existing.top = row;
      existing.topScore = score;
    }
  }

  const ranked = [...byDoc.values()].sort((a, b) => {
    if (b.topScore !== a.topScore) return b.topScore - a.topScore;
    if (b.count !== a.count) return b.count - a.count;
    return a.meta.documentId.localeCompare(b.meta.documentId);
  });

  const items: ReviewQueueItem[] = ranked.slice(0, limit).map(({ meta, top, count }) => {
    const topIssue: ReviewQueueIssue = {
      fieldPath: top.path,
      label: top.label,
      confidenceState: top.confidenceState,
      validationState: top.validationState,
      required: top.required,
      material: top.material,
      message: issueMessage(top),
    };
    return {
      documentId: meta.documentId,
      originalFilename: meta.originalFilename,
      vendorName: meta.vendorName ?? null,
      invoiceNumber: meta.invoiceNumber ?? null,
      total: meta.total ?? null,
      currency: meta.currency ?? null,
      processingStatus: meta.processingStatus,
      reviewStatus: meta.reviewStatus,
      openIssueCount: count,
      topIssue,
    };
  });

  return {
    items,
    totalDocuments: byDoc.size,
    totalOpenIssues: rows.length,
  };
}
