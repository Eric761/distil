import { Link } from "react-router-dom";
import { MapPin, PanelRightOpen } from "lucide-react";
import type { QueryResultRow } from "@invoice/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewStatusBadge } from "@/components/status-indicators";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";

const FORMAT_LABELS: Record<QueryResultRow["documentFormat"], string> = {
  pdf: "PDF",
  txt: "Text",
  markdown: "Markdown",
  csv: "CSV",
  html: "HTML",
};

function IssuesCell({ open }: { open: number | null }) {
  if (open === null) return <span className="text-muted-foreground">—</span>;
  if (open === 0) return <span className="text-success">All clear</span>;
  return <span className="text-amber-700">{open} to review</span>;
}

/** Compact, schema-aware summary of the row's most salient extracted values. */
function SummaryCell({ row }: { row: QueryResultRow }) {
  if (row.vendorName || row.invoiceNumber) {
    return (
      <div className="min-w-0">
        <div className="truncate font-medium">
          {row.vendorName ?? <span className="font-normal text-muted-foreground">—</span>}
        </div>
        {row.invoiceNumber ? (
          <div className="truncate text-xs text-muted-foreground">{row.invoiceNumber}</div>
        ) : null}
      </div>
    );
  }
  const values = row.summaryValues.filter((v) => v.value != null && v.value !== "").slice(0, 2);
  if (values.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="min-w-0 space-y-0.5">
      {values.map((v) => (
        <div key={v.key} className="truncate text-sm" title={`${v.label}: ${v.value}`}>
          <span className="text-muted-foreground">{v.label}: </span>
          <span className="font-medium text-foreground">{v.value}</span>
        </div>
      ))}
    </div>
  );
}

function primarySource(row: QueryResultRow) {
  return row.totalSource ?? row.summaryValues.find((v) => v.source)?.source ?? null;
}

export function ResultsTable({
  items,
  isLoading,
  isFetching,
  isRefreshing = false,
  querySearch,
  onOpenDetails,
  selectedIds,
  onToggleRow,
  allPageSelected,
  onTogglePage,
  trustScope,
}: {
  items: QueryResultRow[];
  isLoading: boolean;
  isFetching: boolean;
  /** True while showing stale rows for a new query (filter/search/sort/page). */
  isRefreshing?: boolean;
  querySearch: string;
  onOpenDetails: (row: QueryResultRow) => void;
  selectedIds: Set<string>;
  onToggleRow: (documentId: string) => void;
  allPageSelected: boolean;
  onTogglePage: () => void;
  trustScope: "approved" | "current";
}) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border bg-card">
      {isRefreshing ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 overflow-hidden bg-primary/10" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-r-full bg-primary/70" />
        </div>
      ) : null}
      <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm">
        <caption className="sr-only">Explore results — one row per document</caption>
        <colgroup>
          <col className="w-12" />
          <col className="w-[22%]" />
          <col className="w-[25%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-10 px-4 py-2.5 font-medium">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                aria-label="Select page"
                checked={items.length > 0 && allPageSelected}
                disabled={items.length === 0}
                onChange={onTogglePage}
              />
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">Document</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Summary</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Review</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Issues</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Updated</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody aria-busy={isFetching || isRefreshing}>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ))}
                </tr>
              ))
            : items.map((row) => {
                const source = primarySource(row);
                return (
                <tr key={row.documentId} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border"
                      aria-label={`Select ${row.originalFilename}`}
                      checked={selectedIds.has(row.documentId)}
                      onChange={() => onToggleRow(row.documentId)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground" title={row.originalFilename}>
                        {row.originalFilename}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                        <Badge tone="info" className="shrink-0">
                          {FORMAT_LABELS[row.documentFormat]}
                        </Badge>
                        <Badge tone="neutral" className="min-w-0 max-w-full overflow-hidden">
                          <span className="truncate">{row.schemaName ?? row.documentType}</span>
                        </Badge>
                        {trustScope === "approved" && row.reviewStatus !== "approved" ? (
                          <Badge tone="warning" className="shrink-0">Update pending</Badge>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><SummaryCell row={row} /></td>
                  <td className="whitespace-nowrap px-4 py-3"><ReviewStatusBadge status={row.reviewStatus} compact /></td>
                  <td className="whitespace-nowrap px-4 py-3"><IssuesCell open={row.openIssues} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(row.updatedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenDetails(row)}
                        aria-label={`Open details for ${row.originalFilename}`}
                      >
                        <PanelRightOpen className="size-4" aria-hidden="true" /> Details
                      </Button>
                      <Link
                        to={{
                          pathname: `/documents/${row.documentId}/review`,
                          search: source
                            ? `?from=explore&focusField=${encodeURIComponent(source.fieldPath)}`
                            : "?from=explore",
                        }}
                        state={{ querySearch }}
                        aria-label={row.totalSource ? "View total source" : source ? "View source" : `Open review for ${row.originalFilename}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted"
                      >
                        <MapPin className="size-4" aria-hidden="true" />
                        {source ? "View source" : "Open review"}
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
