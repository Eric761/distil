import { z } from "zod";
import {
  confidenceState,
  currencyCode,
  decimalString,
  processingStatus,
  reviewStatus,
  validationState,
} from "./common.js";

/**
 * A single unresolved field surfaced in the cross-document review queue. The
 * queue ranks work by materiality and uncertainty so an analyst can clear the
 * most consequential issues first without hunting through documents.
 */
export const reviewQueueIssue = z.object({
  fieldPath: z.string(),
  label: z.string(),
  confidenceState,
  validationState,
  required: z.boolean(),
  material: z.boolean(),
  /** Human, action-oriented summary of what needs attention. */
  message: z.string(),
});
export type ReviewQueueIssue = z.infer<typeof reviewQueueIssue>;

/** One document's entry in the queue: its top issue plus how many remain. */
export const reviewQueueItem = z.object({
  documentId: z.string().uuid(),
  originalFilename: z.string(),
  vendorName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  total: decimalString.nullable(),
  currency: currencyCode.nullable(),
  processingStatus,
  reviewStatus,
  openIssueCount: z.number().int().min(0),
  topIssue: reviewQueueIssue,
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItem>;

export const reviewQueueResponse = z.object({
  items: z.array(reviewQueueItem),
  /** Distinct documents with at least one open issue. */
  totalDocuments: z.number().int().min(0),
  /** Total unresolved fields across all non-approved documents. */
  totalOpenIssues: z.number().int().min(0),
});
export type ReviewQueueResponse = z.infer<typeof reviewQueueResponse>;
