import {
  and,
  asc,
  between,
  count,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  type SchemaFieldDef,
  INVOICE_TYPE,
  ERROR_CODES,
  isoDate,
  type FieldFilter,
  type QueryFilters,
  type QueryRequest,
  type QueryResultRow,
  type QuerySummary,
  type QuerySummaryValue,
  type QueryTrustScope,
  type ResultSourceLink,
} from "@invoice/contracts";
import { detectFormat } from "@invoice/extraction";
import { getDb } from "../db/client.js";
import {
  documentSchemas,
  documentSchemaVersions,
  documents,
  extractionFields,
  extractions,
  invoiceRecords,
  sourceReferences,
} from "../db/schema.js";
import { AppError } from "../lib/errors.js";

export async function getKnownVendors(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ vendor: invoiceRecords.vendorName })
    .from(invoiceRecords)
    .where(isNotNull(invoiceRecords.vendorName));
  return rows.map((r) => r.vendor).filter((v): v is string => Boolean(v));
}

function selectedExtractionId(scope: QueryTrustScope): SQL<string | null> {
  return scope === "current"
    ? sql`${documents.currentExtractionId}`
    : sql`coalesce(${documents.lastApprovedExtractionId}, ${documents.currentExtractionId})`;
}

function selectedTextValue(path: string, scope: QueryTrustScope): SQL<string | null> {
  return sql<string | null>`(
    select coalesce(
      selected_field.value_text,
      selected_field.corrected_value #>> '{}',
      selected_field.extracted_value #>> '{}'
    )
    from extraction_fields selected_field
    where selected_field.extraction_id = ${selectedExtractionId(scope)}
      and selected_field.path = ${path}
    limit 1
  )`;
}

function selectedNumericValue(path: string, scope: QueryTrustScope): SQL<string | null> {
  return sql<string | null>`(
    select coalesce(
      selected_field.value_numeric,
      case
        when coalesce(
          selected_field.corrected_value #>> '{}',
          selected_field.extracted_value #>> '{}'
        ) ~ '^-?[0-9]+([.][0-9]+)?$'
        then coalesce(
          selected_field.corrected_value #>> '{}',
          selected_field.extracted_value #>> '{}'
        )::numeric
      end
    )
    from extraction_fields selected_field
    where selected_field.extraction_id = ${selectedExtractionId(scope)}
      and selected_field.path = ${path}
    limit 1
  )`;
}

function selectedDateValue(path: string, scope: QueryTrustScope): SQL<string | null> {
  return sql<string | null>`(
    select coalesce(
      selected_field.value_date,
      case
        when coalesce(
          selected_field.corrected_value #>> '{}',
          selected_field.extracted_value #>> '{}'
        ) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then coalesce(
          selected_field.corrected_value #>> '{}',
          selected_field.extracted_value #>> '{}'
        )
      end
    )
    from extraction_fields selected_field
    where selected_field.extraction_id = ${selectedExtractionId(scope)}
      and selected_field.path = ${path}
    limit 1
  )`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (ch) => `\\${ch}`);
}

function ilikeContains(expr: SQL<string | null>, value: string): SQL {
  return sql`${expr} ilike ${`%${escapeLike(value)}%`} escape '\\'`;
}

function ilikeEquals(expr: SQL<string | null>, value: string): SQL {
  return sql`${expr} ilike ${escapeLike(value)} escape '\\'`;
}

/** A correlated EXISTS over the selected extraction's fields. */
function fieldExists(inner: SQL, scope: QueryTrustScope): SQL {
  const db = getDb();
  return exists(
    db
      .select({ one: sql`1` })
      .from(extractionFields)
      .where(and(eq(extractionFields.extractionId, selectedExtractionId(scope)), inner)),
  );
}

function fieldFilterCondition(filter: FieldFilter, scope: QueryTrustScope): SQL {
  const keyMatch = eq(extractionFields.schemaFieldKey, filter.path);
  const value = filter.value ?? "";
  switch (filter.op) {
    case "exists":
      return fieldExists(and(keyMatch, eq(extractionFields.presenceState, "present"))!, scope);
    case "contains":
      return fieldExists(and(keyMatch, ilikeContains(sql`${extractionFields.valueText}`, value))!, scope);
    case "eq":
      return fieldExists(and(keyMatch, ilikeEquals(sql`${extractionFields.valueText}`, value))!, scope);
    case "gt":
      return fieldExists(and(keyMatch, sql`${extractionFields.valueNumeric} > ${value}`)!, scope);
    case "gte":
      return fieldExists(and(keyMatch, sql`${extractionFields.valueNumeric} >= ${value}`)!, scope);
    case "lt":
      return fieldExists(and(keyMatch, sql`${extractionFields.valueNumeric} < ${value}`)!, scope);
    case "lte":
      return fieldExists(and(keyMatch, sql`${extractionFields.valueNumeric} <= ${value}`)!, scope);
    default:
      return keyMatch;
  }
}

function buildConditions(filters: QueryFilters, scope: QueryTrustScope): SQL[] {
  const conditions: SQL[] = [];

  // Default scope: last-approved records only, unless the user asks otherwise.
  if (filters.reviewStatus && filters.reviewStatus.length > 0) {
    conditions.push(inArray(documents.reviewStatus, filters.reviewStatus));
  } else if (scope === "approved") {
    conditions.push(or(eq(documents.reviewStatus, "approved"), isNotNull(documents.lastApprovedExtractionId))!);
  }

  if (filters.search) {
    conditions.push(
      or(
        ilikeContains(sql`${documents.originalFilename}`, filters.search),
        ilikeContains(selectedTextValue("vendorName", scope), filters.search),
        fieldExists(ilikeContains(sql`${extractionFields.valueText}`, filters.search), scope),
      )!,
    );
  }
  if (filters.schemaKey) {
    conditions.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(extractions)
          .where(and(eq(extractions.id, selectedExtractionId(scope)), eq(extractions.schemaKey, filters.schemaKey))),
      ),
    );
  }
  if (filters.vendor) {
    conditions.push(ilikeContains(selectedTextValue("vendorName", scope), filters.vendor));
  }
  if (filters.currency) {
    conditions.push(eq(selectedTextValue("currency", scope), filters.currency));
  }
  if (filters.amount) {
    const a = filters.amount;
    const total = selectedNumericValue("total", scope);
    if (a.comparator === "gt") conditions.push(gt(total, a.value));
    else if (a.comparator === "gte") conditions.push(gte(total, a.value));
    else if (a.comparator === "lt") conditions.push(lt(total, a.value));
    else if (a.comparator === "lte") conditions.push(lte(total, a.value));
    else if (a.comparator === "between" && a.valueTo) {
      conditions.push(between(total, a.value, a.valueTo));
    }
  }
  const invoiceDate = selectedDateValue("invoiceDate", scope);
  const dueDate = selectedDateValue("dueDate", scope);
  if (filters.invoiceDate?.from) conditions.push(gte(invoiceDate, filters.invoiceDate.from));
  if (filters.invoiceDate?.to) conditions.push(lte(invoiceDate, filters.invoiceDate.to));
  if (filters.dueDate?.from) conditions.push(gte(dueDate, filters.dueDate.from));
  if (filters.dueDate?.to) conditions.push(lte(dueDate, filters.dueDate.to));
  if (filters.processingStatus && filters.processingStatus.length > 0) {
    conditions.push(inArray(documents.processingStatus, filters.processingStatus));
  }
  if (filters.documentType) {
    conditions.push(eq(documents.documentType, filters.documentType));
  }
  for (const f of filters.fields ?? []) {
    conditions.push(fieldFilterCondition(f, scope));
  }

  return conditions;
}

function schemaFieldKeys(fields: SchemaFieldDef[], prefix = ""): string[] {
  const keys: string[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    if (field.nodeKind === "scalar") keys.push(path);
    if (field.nodeKind === "object") keys.push(...schemaFieldKeys(field.children ?? [], path));
    if (field.nodeKind === "array") {
      for (const child of field.item?.children ?? []) {
        if (child.nodeKind === "scalar") keys.push(`${field.key}[].${child.key}`);
      }
    }
  }
  return keys;
}

async function assertAllowedFieldFilters(filters: QueryFilters): Promise<void> {
  if (!filters.fields || filters.fields.length === 0) return;
  const db = getDb();
  const rows = await db
    .select({ definition: documentSchemaVersions.definition })
    .from(documentSchemaVersions)
    .innerJoin(documentSchemas, eq(documentSchemas.id, documentSchemaVersions.schemaId))
    .where(filters.schemaKey ? eq(documentSchemas.key, filters.schemaKey) : undefined);

  const allowed = new Set<string>();
  for (const row of rows) {
    for (const key of schemaFieldKeys(row.definition as SchemaFieldDef[])) allowed.add(key);
  }

  const invalid = filters.fields.filter((f) => !allowed.has(f.path));
  if (invalid.length > 0) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_FAILED,
      status: 400,
      title: "Invalid field filter",
      detail: filters.schemaKey
        ? `One or more fields are not declared by schema "${filters.schemaKey}".`
        : "One or more fields are not declared by any known schema.",
      fieldErrors: invalid.map((f) => ({ path: "fields", message: `${f.path} is not a queryable schema field.` })),
    });
  }
}

async function totalSourceLinks(inputRows: Array<{ documentId: string; selectedExtractionId: string | null }>): Promise<Map<string, ResultSourceLink>> {
  const map = new Map<string, ResultSourceLink>();
  const withExtraction = inputRows.filter((r): r is { documentId: string; selectedExtractionId: string } =>
    Boolean(r.selectedExtractionId),
  );
  if (withExtraction.length === 0) return map;
  const db = getDb();

  const docByExtraction = new Map(withExtraction.map((r) => [r.selectedExtractionId, r.documentId]));
  const rows = await db
    .select({
      extractionId: extractionFields.extractionId,
      page: sourceReferences.page,
      box: sourceReferences.box,
    })
    .from(extractionFields)
    .leftJoin(sourceReferences, eq(sourceReferences.fieldId, extractionFields.id))
    .where(and(inArray(extractionFields.extractionId, withExtraction.map((r) => r.selectedExtractionId)), eq(extractionFields.path, "total")));

  for (const row of rows) {
    const documentId = docByExtraction.get(row.extractionId);
    if (!documentId || map.has(documentId)) continue;
    map.set(documentId, {
      documentId,
      fieldPath: "total",
      page: row.page ?? null,
      hasBox: row.box !== null && row.box !== undefined,
    });
  }
  return map;
}

async function sourceLinksByFieldId(
  inputRows: Array<{ documentId: string; selectedExtractionId: string | null }>,
): Promise<Map<string, ResultSourceLink>> {
  const map = new Map<string, ResultSourceLink>();
  const withExtraction = inputRows.filter((r): r is { documentId: string; selectedExtractionId: string } =>
    Boolean(r.selectedExtractionId),
  );
  if (withExtraction.length === 0) return map;
  const db = getDb();

  const docByExtraction = new Map(withExtraction.map((r) => [r.selectedExtractionId, r.documentId]));
  const rows = await db
    .select({
      fieldId: extractionFields.id,
      extractionId: extractionFields.extractionId,
      path: extractionFields.path,
      page: sourceReferences.page,
      box: sourceReferences.box,
      offsetStart: sourceReferences.offsetStart,
      offsetEnd: sourceReferences.offsetEnd,
    })
    .from(extractionFields)
    .leftJoin(sourceReferences, eq(sourceReferences.fieldId, extractionFields.id))
    .where(inArray(extractionFields.extractionId, withExtraction.map((r) => r.selectedExtractionId)));

  for (const row of rows) {
    const documentId = docByExtraction.get(row.extractionId);
    if (!documentId || map.has(row.fieldId)) continue;
    map.set(row.fieldId, {
      documentId,
      fieldPath: row.path,
      page: row.page ?? null,
      hasBox: row.box !== null && row.box !== undefined,
    });
  }
  return map;
}

/** Generic schema-declared summary values for non-invoice result rows. */
async function summaryValuesByDocument(
  docs: Array<{ documentId: string; documentType: string; selectedExtractionId: string | null }>,
): Promise<Map<string, QuerySummaryValue[]>> {
  const db = getDb();
  const map = new Map<string, QuerySummaryValue[]>();
  const eligible = docs.filter(
    (doc): doc is typeof doc & { selectedExtractionId: string } =>
      doc.documentType !== INVOICE_TYPE && Boolean(doc.selectedExtractionId),
  );
  docs.forEach((doc) => map.set(doc.documentId, []));
  if (eligible.length === 0) return map;
  const sourcesByFieldId = await sourceLinksByFieldId(eligible);

  const docByExtraction = new Map(eligible.map((doc) => [doc.selectedExtractionId, doc.documentId]));
  const rows = await db
    .select({
      fieldId: extractionFields.id,
      extractionId: extractionFields.extractionId,
      schemaFieldKey: extractionFields.schemaFieldKey,
      label: extractionFields.label,
      valueText: sql<string | null>`coalesce(
        ${extractionFields.valueText},
        ${extractionFields.correctedValue} #>> '{}',
        ${extractionFields.extractedValue} #>> '{}'
      )`,
      path: extractionFields.path,
    })
    .from(extractionFields)
    .where(
      and(
        inArray(extractionFields.extractionId, eligible.map((doc) => doc.selectedExtractionId)),
        eq(extractionFields.nodeKind, "scalar"),
        sql`${extractionFields.path} not like '%[%'`,
      ),
    )
    .orderBy(asc(extractionFields.extractionId), asc(extractionFields.sortOrder));

  for (const row of rows) {
    if (row.valueText == null || row.valueText === "") continue;
    const documentId = docByExtraction.get(row.extractionId);
    if (!documentId) continue;
    const values = map.get(documentId)!;
    if (values.length >= 4) continue;
    values.push({
      key: row.schemaFieldKey ?? row.path,
      label: row.label,
      value: row.valueText,
      source: sourcesByFieldId.get(row.fieldId) ?? null,
    });
  }

  // Table-only documents (CSV, repeated records) need a compact fallback.
  await Promise.all(
    eligible
      .filter((doc) => (map.get(doc.documentId)?.length ?? 0) === 0)
      .map(async (doc) => {
        const cells = await db
          .select({
            fieldId: extractionFields.id,
            schemaFieldKey: extractionFields.schemaFieldKey,
            label: extractionFields.label,
            valueText: sql<string | null>`coalesce(
              ${extractionFields.valueText},
              ${extractionFields.correctedValue} #>> '{}',
              ${extractionFields.extractedValue} #>> '{}'
            )`,
            path: extractionFields.path,
          })
          .from(extractionFields)
          .where(
            and(
              eq(extractionFields.extractionId, doc.selectedExtractionId),
              eq(extractionFields.nodeKind, "scalar"),
            ),
          )
          .orderBy(asc(extractionFields.sortOrder))
          .limit(200);
        const repeated = cells
          .map((cell) => ({ cell, match: /^([A-Za-z0-9_]+)\[(\d+)\]\.(.+)$/u.exec(cell.path) }))
          .filter((entry) => entry.match && entry.cell.valueText);
        if (repeated.length === 0) return;
        const rowIndexes = new Set(repeated.map((entry) => entry.match![2]));
        const firstIndex = repeated[0]!.match![2];
        const firstRow = repeated.filter((entry) => entry.match![2] === firstIndex).slice(0, 2);
        map.set(doc.documentId, [
          {
            key: `${repeated[0]!.match![1]}Count`,
            label: "Records",
            value: `${rowIndexes.size}${cells.length === 200 ? "+" : ""}`,
          },
          ...firstRow.map(({ cell }) => ({
            key: cell.schemaFieldKey ?? cell.path,
            label: cell.label,
            value: cell.valueText,
            source: sourcesByFieldId.get(cell.fieldId) ?? null,
          })),
        ]);
      }),
  );
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
  const scope = req.trustScope ?? "approved";
  await assertAllowedFieldFilters(req.filters);
  const conditions = buildConditions(req.filters, scope);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const vendorValue = selectedTextValue("vendorName", scope);
  const invoiceNumberValue = selectedTextValue("invoiceNumber", scope);
  const invoiceDateValue = selectedDateValue("invoiceDate", scope);
  const currencyValue = selectedTextValue("currency", scope);
  const totalValue = selectedNumericValue("total", scope);

  const sortColumn =
    req.sort === "total"
      ? totalValue
      : req.sort === "invoiceDate"
        ? invoiceDateValue
        : req.sort === "vendorName"
          ? vendorValue
        : req.sort === "filename"
          ? documents.originalFilename
          : req.sort === "schemaName"
            ? documents.schemaName
          : req.sort === "updatedAt"
            ? documents.updatedAt
            : documents.approvedAt;
  const orderBy = req.direction === "asc"
    ? sql`${sortColumn} asc nulls last`
    : sql`${sortColumn} desc nulls last`;

  const rows = await db
    .select({
      documentId: documents.id,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      documentType: documents.documentType,
      schemaName: documents.schemaName,
      vendorName: vendorValue.as("selected_vendor_name"),
      invoiceNumber: invoiceNumberValue.as("selected_invoice_number"),
      invoiceDate: invoiceDateValue.as("selected_invoice_date"),
      currency: currencyValue.as("selected_currency"),
      total: totalValue.as("selected_total"),
      reviewStatus: documents.reviewStatus,
      currentExtractionId: documents.currentExtractionId,
      selectedExtractionId: selectedExtractionId(scope).as("selected_extraction_id"),
    })
    .from(documents)
    .where(where)
    .orderBy(orderBy)
    .limit(req.pageSize)
    .offset((req.page - 1) * req.pageSize);

  const totalRows = await db
    .select({ c: count() })
    .from(documents)
    .where(where);
  const total = Number(totalRows[0]?.c ?? 0);

  // Aggregate over the whole matching set, bucketed by currency (invoice math
  // never crosses currencies). Non-invoice documents contribute a null bucket.
  const summaryCurrencyFields = alias(extractionFields, "summary_currency_fields");
  const summaryTotalFields = alias(extractionFields, "summary_total_fields");
  const summaryCurrencyValue = sql<string | null>`coalesce(
    ${summaryCurrencyFields.valueText},
    ${summaryCurrencyFields.correctedValue} #>> '{}',
    ${summaryCurrencyFields.extractedValue} #>> '{}'
  )`;
  const summaryTotalValue = sql<string | null>`coalesce(
    ${summaryTotalFields.valueNumeric},
    case
      when coalesce(
        ${summaryTotalFields.correctedValue} #>> '{}',
        ${summaryTotalFields.extractedValue} #>> '{}'
      ) ~ '^-?[0-9]+([.][0-9]+)?$'
      then coalesce(
        ${summaryTotalFields.correctedValue} #>> '{}',
        ${summaryTotalFields.extractedValue} #>> '{}'
      )::numeric
    end
  )`;
  const summaryRows = await db
    .select({
      currency: summaryCurrencyValue.as("selected_currency"),
      c: count(),
      s: sum(summaryTotalValue),
    })
    .from(documents)
    .leftJoin(
      summaryCurrencyFields,
      and(
        eq(summaryCurrencyFields.extractionId, selectedExtractionId(scope)),
        eq(summaryCurrencyFields.path, "currency"),
      ),
    )
    .leftJoin(
      summaryTotalFields,
      and(
        eq(summaryTotalFields.extractionId, selectedExtractionId(scope)),
        eq(summaryTotalFields.path, "total"),
      ),
    )
    .where(where)
    .groupBy(summaryCurrencyValue);
  const summary: QuerySummary = {
    totalCount: total,
    byCurrency: summaryRows
      .filter((r) => r.currency != null && r.s != null)
      .map((r) => ({
        currency: r.currency,
        count: Number(r.c ?? 0),
        total: r.s != null ? String(r.s) : "0",
      }))
      .sort((a, b) => b.count - a.count),
  };

  const schemaRows = await db
    .select({
      schemaKey: documents.documentType,
      schemaName: documents.schemaName,
      c: count(),
    })
    .from(documents)
    .where(where)
    .groupBy(documents.documentType, documents.schemaName);
  summary.bySchema = schemaRows
    .map((r) => ({
      schemaKey: r.schemaKey,
      schemaName: r.schemaName,
      count: Number(r.c ?? 0),
    }))
    .sort((a, b) => b.count - a.count || (a.schemaName ?? a.schemaKey).localeCompare(b.schemaName ?? b.schemaKey));

  const sources = await totalSourceLinks(rows.map((r) => ({ documentId: r.documentId, selectedExtractionId: r.selectedExtractionId })));
  const summaryValues = await summaryValuesByDocument(
    rows.map((r) => ({ documentId: r.documentId, documentType: r.documentType, selectedExtractionId: r.selectedExtractionId })),
  );

  const currentExtractionIds = rows
    .map((row) => row.currentExtractionId)
    .filter((id): id is string => Boolean(id));
  const issueCounts = currentExtractionIds.length > 0
    ? await db
        .select({ extractionId: extractionFields.extractionId, c: count() })
        .from(extractionFields)
        .where(
          and(
            inArray(extractionFields.extractionId, currentExtractionIds),
            eq(extractionFields.needsAttention, true),
          ),
        )
        .groupBy(extractionFields.extractionId)
    : [];
  const countByExtraction = new Map(
    issueCounts.map((row) => [row.extractionId, Number(row.c ?? 0)]),
  );
  const openById = new Map(
    rows.map((row) => [
      row.documentId,
      row.currentExtractionId ? (countByExtraction.get(row.currentExtractionId) ?? 0) : null,
    ]),
  );

  const items: QueryResultRow[] = rows.map((r) => ({
    documentId: r.documentId,
    originalFilename: r.originalFilename,
    documentType: r.documentType,
    documentFormat: detectFormat(r.originalFilename, r.mimeType) ?? "txt",
    schemaName: r.schemaName,
    vendorName: r.vendorName,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: isoDateOrNull(r.invoiceDate),
    currency: r.currency,
    total: r.total,
    summaryValues: summaryValues.get(r.documentId) ?? [],
    reviewStatus: r.reviewStatus,
    openIssues: openById.get(r.documentId) ?? null,
    totalSource: r.total != null ? (sources.get(r.documentId) ?? null) : null,
  }));

  return { items, total, summary };
}
