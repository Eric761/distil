import { queryResponse, type QueryRequest, type QueryResponse, type QueryResultRow } from "@invoice/contracts";
import { apiRequest } from "@/lib/api-client";

const EXPORT_PAGE_SIZE = 50; // max the contract allows per request
const MAX_PAGES = 40; // safety cap (2,000 rows) so an export can never run away

/**
 * Fetch every matching record for the current query (across all pages), not
 * just the visible page — so an export reflects the full result set.
 */
export async function fetchAllResultRows(request: QueryRequest): Promise<QueryResultRow[]> {
  const rows: QueryResultRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await apiRequest<QueryResponse>(`/query`, {
      method: "POST",
      body: { ...request, page, pageSize: EXPORT_PAGE_SIZE, acknowledgeWarnings: true },
      schema: queryResponse,
    });
    rows.push(...res.items);
    if (page >= res.pagination.totalPages) break;
  }
  return rows;
}

const CSV_COLUMNS: Array<{ header: string; get: (r: QueryResultRow) => string | number | null }> = [
  { header: "Vendor", get: (r) => r.vendorName },
  { header: "Invoice #", get: (r) => r.invoiceNumber },
  { header: "Invoice date", get: (r) => r.invoiceDate },
  { header: "Currency", get: (r) => r.currency },
  { header: "Total", get: (r) => r.total },
  { header: "Review status", get: (r) => r.reviewStatus },
  { header: "Open issues", get: (r) => r.openIssues },
  { header: "Document ID", get: (r) => r.documentId },
];

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s;
}

export function rowsToCsv(rows: QueryResultRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(c.get(r))).join(","));
  return [header, ...body].join("\r\n");
}

export function rowsToJson(rows: QueryResultRow[]): string {
  return JSON.stringify(rows, null, 2);
}

/** Trigger a client-side download of a text payload. */
export function downloadTextFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
