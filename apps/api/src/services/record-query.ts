import { and, asc, between, count, desc, eq, gt, gte, ilike, inArray, isNotNull, lt, lte, sum, type SQL } from "drizzle-orm";
import {
  isoDate,
  type QueryFilters,
  type QueryRequest,
  type QueryResultRow,
  type QuerySummary,
  type ResultSourceLink,
} from "@invoice/contracts";
import { getDb } from "../db/client.js";
import { documents, extractionFields, invoiceRecords, sourceReferences } from "../db/schema.js";

export async function getKnownVendors(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ vendor: invoiceRecords.vendorName })
    .from(invoiceRecords)
    .where(isNotNull(invoiceRecords.vendorName));
  return rows.map((r) => r.vendor).filter((v): v is string => Boolean(v));
}

function buildConditions(filters: QueryFilters): SQL[] {
  const conditions: SQL[] = [];

  // Default scope: approved records only, unless the user asks otherwise.
  if (filters.reviewStatus && filters.reviewStatus.length > 0) {
    conditions.push(inArray(documents.reviewStatus, filters.reviewStatus));
  } else {
    conditions.push(eq(documents.reviewStatus, "approved"));
  }

  if (filters.vendor) {
    conditions.push(ilike(invoiceRecords.vendorName, `%${filters.vendor}%`));
  }
  if (filters.currency) {
    conditions.push(eq(invoiceRecords.currency, filters.currency));
  }
  if (filters.amount) {
    const a = filters.amount;
    if (a.comparator === "gt") conditions.push(gt(invoiceRecords.total, a.value));
    else if (a.comparator === "gte") conditions.push(gte(invoiceRecords.total, a.value));
    else if (a.comparator === "lt") conditions.push(lt(invoiceRecords.total, a.value));
    else if (a.comparator === "lte") conditions.push(lte(invoiceRecords.total, a.value));
    else if (a.comparator === "between" && a.valueTo) {
      conditions.push(between(invoiceRecords.total, a.value, a.valueTo));
    }
  }
  if (filters.invoiceDate?.from) conditions.push(gte(invoiceRecords.invoiceDate, filters.invoiceDate.from));
  if (filters.invoiceDate?.to) conditions.push(lte(invoiceRecords.invoiceDate, filters.invoiceDate.to));
  if (filters.dueDate?.from) conditions.push(gte(invoiceRecords.dueDate, filters.dueDate.from));
  if (filters.dueDate?.to) conditions.push(lte(invoiceRecords.dueDate, filters.dueDate.to));
  if (filters.processingStatus && filters.processingStatus.length > 0) {
    conditions.push(inArray(documents.processingStatus, filters.processingStatus));
  }
  if (filters.documentType) {
    conditions.push(eq(documents.documentType, filters.documentType));
  }

  return conditions;
}

async function totalSourceLinks(documentIds: string[]): Promise<Map<string, ResultSourceLink>> {
  const map = new Map<string, ResultSourceLink>();
  if (documentIds.length === 0) return map;
  const db = getDb();

  const rows = await db
    .select({
      documentId: documents.id,
      page: sourceReferences.page,
      box: sourceReferences.box,
    })
    .from(documents)
    .innerJoin(extractionFields, eq(extractionFields.extractionId, documents.currentExtractionId))
    .leftJoin(sourceReferences, eq(sourceReferences.fieldId, extractionFields.id))
    .where(and(inArray(documents.id, documentIds), eq(extractionFields.path, "total")));

  for (const row of rows) {
    if (map.has(row.documentId)) continue;
    map.set(row.documentId, {
      documentId: row.documentId,
      fieldPath: "total",
      page: row.page ?? null,
      hasBox: row.box !== null && row.box !== undefined,
    });
  }
  return map;
}

function isoDateOrNull(value: string | null): string | null {
  return isoDate.safeParse(value).success ? value : null;
}

export async function runFilters(req: QueryRequest & { filters: QueryFilters }): Promise<{
  items: QueryResultRow[];
  total: number;
  summary: QuerySummary;
}> {
  const db = getDb();
  const conditions = buildConditions(req.filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn =
    req.sort === "total"
      ? invoiceRecords.total
      : req.sort === "invoiceDate"
        ? invoiceRecords.invoiceDate
        : req.sort === "vendorName"
          ? invoiceRecords.vendorName
          : invoiceRecords.approvedAt;
  const orderBy = req.direction === "asc" ? asc(sortColumn) : desc(sortColumn);

  const rows = await db
    .select({
      documentId: invoiceRecords.documentId,
      vendorName: invoiceRecords.vendorName,
      invoiceNumber: invoiceRecords.invoiceNumber,
      invoiceDate: invoiceRecords.invoiceDate,
      currency: invoiceRecords.currency,
      total: invoiceRecords.total,
      reviewStatus: documents.reviewStatus,
      currentExtractionId: documents.currentExtractionId,
    })
    .from(invoiceRecords)
    .innerJoin(documents, eq(documents.id, invoiceRecords.documentId))
    .where(where)
    .orderBy(orderBy)
    .limit(req.pageSize)
    .offset((req.page - 1) * req.pageSize);

  const totalRows = await db
    .select({ c: count() })
    .from(invoiceRecords)
    .innerJoin(documents, eq(documents.id, invoiceRecords.documentId))
    .where(where);
  const total = Number(totalRows[0]?.c ?? 0);

  // Aggregate over the whole matching set (not just this page), bucketed by
  // currency since amounts across currencies must never be summed together.
  const summaryRows = await db
    .select({
      currency: invoiceRecords.currency,
      c: count(),
      s: sum(invoiceRecords.total),
    })
    .from(invoiceRecords)
    .innerJoin(documents, eq(documents.id, invoiceRecords.documentId))
    .where(where)
    .groupBy(invoiceRecords.currency);
  const summary: QuerySummary = {
    totalCount: total,
    byCurrency: summaryRows
      .map((r) => ({
        currency: r.currency,
        count: Number(r.c ?? 0),
        total: r.s != null ? String(r.s) : "0",
      }))
      .sort((a, b) => b.count - a.count),
  };

  const sources = await totalSourceLinks(rows.map((r) => r.documentId));

  const openIssueRows = await Promise.all(
    rows.map(async (r) => {
      if (!r.currentExtractionId) return { id: r.documentId, open: null as number | null };
      const [c] = await db
        .select({ c: count() })
        .from(extractionFields)
        .where(and(eq(extractionFields.extractionId, r.currentExtractionId), eq(extractionFields.needsAttention, true)));
      return { id: r.documentId, open: Number(c?.c ?? 0) };
    }),
  );
  const openById = new Map(openIssueRows.map((o) => [o.id, o.open]));

  const items: QueryResultRow[] = rows.map((r) => ({
    documentId: r.documentId,
    vendorName: r.vendorName,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: isoDateOrNull(r.invoiceDate),
    currency: r.currency,
    total: r.total,
    reviewStatus: r.reviewStatus,
    openIssues: openById.get(r.documentId) ?? null,
    totalSource: sources.get(r.documentId) ?? null,
  }));

  return { items, total, summary };
}
