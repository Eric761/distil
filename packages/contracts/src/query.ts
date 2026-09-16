import { z } from "zod";
import {
  currencyCode,
  decimalString,
  documentType,
  isoDate,
  pagination,
  processingStatus,
  reviewStatus,
} from "./common.js";
import { documentFormat } from "./documents.js";

/**
 * Canonical, allowlisted query filters. These are the *source of truth* for a
 * query — natural language is only a convenience that produces these. The
 * server never accepts SQL, column names, or arbitrary operators.
 */

export const amountComparator = z.enum(["gt", "gte", "lt", "lte", "between"]);
export type AmountComparator = z.infer<typeof amountComparator>;

export const amountFilter = z.object({
  comparator: amountComparator,
  value: decimalString,
  /** Only used for "between". */
  valueTo: decimalString.optional(),
});
export type AmountFilter = z.infer<typeof amountFilter>;

export const dateFilter = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type DateFilter = z.infer<typeof dateFilter>;

/**
 * A typed field filter over the schema-declared, indexed extraction fields.
 * `path` is a stable schema-field key (e.g. "/candidate/name"); the server
 * only accepts fields the schema actually declares — never arbitrary columns.
 */
export const fieldFilter = z.object({
  path: z.string().min(1).max(200),
  op: z.enum(["eq", "contains", "gt", "gte", "lt", "lte", "exists"]),
  value: z.string().max(400).optional(),
});
export type FieldFilter = z.infer<typeof fieldFilter>;

export const queryFilters = z.object({
  /** Global full-text search across filename and canonical content. */
  search: z.string().trim().min(1).max(200).optional(),
  /** Restrict to a schema family (Explore single-schema view). */
  schemaKey: z.string().trim().min(1).max(64).optional(),
  vendor: z.string().trim().min(1).max(200).optional(),
  amount: amountFilter.optional(),
  currency: currencyCode.optional(),
  invoiceDate: dateFilter.optional(),
  dueDate: dateFilter.optional(),
  reviewStatus: z.array(reviewStatus).optional(),
  processingStatus: z.array(processingStatus).optional(),
  documentType: documentType.optional(),
  /** Schema-scoped typed field predicates over indexed extraction fields. */
  fields: z.array(fieldFilter).optional(),
});
export type QueryFilters = z.infer<typeof queryFilters>;

export const querySort = z.enum([
  "total",
  "invoiceDate",
  "vendorName",
  "filename",
  "schemaName",
  "approvedAt",
  "updatedAt",
]);
export type QuerySort = z.infer<typeof querySort>;

export const queryTrustScope = z.enum(["approved", "current"]);
export type QueryTrustScope = z.infer<typeof queryTrustScope>;

export const queryRequest = z.object({
  /** Optional natural-language text to interpret into filters. */
  text: z.string().trim().max(400).optional(),
  /** Explicit structured filters. Merged over/replacing interpreted ones. */
  filters: queryFilters.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  sort: querySort.default("approvedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  /** Default trust scope: read approved snapshots; opt in to current values. */
  trustScope: queryTrustScope.default("approved"),
  /** User has seen and accepted interpretation warnings. */
  acknowledgeWarnings: z.boolean().optional(),
});
export type QueryRequest = z.infer<typeof queryRequest>;

/** A single interpreted filter chip, shown to the user as editable. */
export const interpretedChip = z.object({
  key: z.enum([
    "search",
    "schemaKey",
    "vendor",
    "amount",
    "currency",
    "invoiceDate",
    "dueDate",
    "reviewStatus",
    "processingStatus",
    "documentType",
    "fields",
  ]),
  label: z.string(),
  /** Human summary, e.g. "Amount > 10,000". */
  display: z.string(),
});
export type InterpretedChip = z.infer<typeof interpretedChip>;

export const queryInterpretation = z.object({
  originalText: z.string().nullable(),
  filters: queryFilters,
  chips: z.array(interpretedChip),
  /** Terms we could not map to any filter. */
  unparsedTerms: z.array(z.string()),
  warnings: z.array(z.string()),
  /** True when executing as-is would be misleading. */
  needsClarification: z.boolean(),
});
export type QueryInterpretation = z.infer<typeof queryInterpretation>;

/**
 * A source link for a result cell, enabling result -> record -> field ->
 * source -> document traceability.
 */
export const resultSourceLink = z.object({
  documentId: z.string().uuid(),
  fieldPath: z.string(),
  page: z.number().int().min(1).nullable(),
  hasBox: z.boolean(),
});
export type ResultSourceLink = z.infer<typeof resultSourceLink>;

export const querySummaryValue = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  /** Best source link for this displayed value, when available. */
  source: resultSourceLink.nullable().optional(),
});
export type QuerySummaryValue = z.infer<typeof querySummaryValue>;

export const queryResultRow = z.object({
  documentId: z.string().uuid(),
  originalFilename: z.string(),
  documentType: z.string(),
  documentFormat,
  schemaName: z.string().nullable(),
  /** Invoice preview fields (null for non-invoice documents). */
  vendorName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: isoDate.nullable(),
  currency: currencyCode.nullable(),
  total: decimalString.nullable(),
  /** Generic schema-declared summary values (non-invoice documents). */
  summaryValues: z.array(querySummaryValue),
  reviewStatus,
  openIssues: z.number().int().min(0).nullable(),
  updatedAt: z.string().datetime(),
  /** Provenance link for the total cell (the most-traced value). */
  totalSource: resultSourceLink.nullable(),
});
export type QueryResultRow = z.infer<typeof queryResultRow>;

/**
 * Aggregate over the *entire* matching set (not just the current page), so the
 * UI can show "how much / how many" and satisfy the "queryable data" goal.
 * Bucketed by currency because amounts are never converted across currencies.
 */
export const querySummaryBucket = z.object({
  currency: currencyCode.nullable(),
  count: z.number().int().min(0),
  total: decimalString,
});
export type QuerySummaryBucket = z.infer<typeof querySummaryBucket>;

export const querySummary = z.object({
  totalCount: z.number().int().min(0),
  byCurrency: z.array(querySummaryBucket),
  bySchema: z
    .array(
      z.object({
        schemaKey: z.string(),
        schemaName: z.string().nullable(),
        count: z.number().int().min(0),
      }),
    )
    .optional(),
});
export type QuerySummary = z.infer<typeof querySummary>;

export const queryResponse = z.object({
  interpretation: queryInterpretation,
  items: z.array(queryResultRow),
  pagination,
  /** Optional so older fixtures/clients still validate; the server always sends it. */
  summary: querySummary.optional(),
});
export type QueryResponse = z.infer<typeof queryResponse>;
