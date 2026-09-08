import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import type { QueryResultRow } from "@invoice/contracts";
import { ReviewStatusBadge } from "@/components/status-indicators";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";

function IssuesCell({ open }: { open: number | null }) {
  if (open === null) return <span className="text-muted-foreground">—</span>;
  if (open === 0) return <span className="text-success">All clear</span>;
  return <span className="text-amber-700">{open} to review</span>;
}

export function ResultsTable({
  items,
  isLoading,
  isFetching,
  isRefreshing = false,
  querySearch,
}: {
  items: QueryResultRow[];
  isLoading: boolean;
  isFetching: boolean;
  /** True while showing stale rows for a new query (filter/search/sort/page). */
  isRefreshing?: boolean;
  querySearch: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      {isRefreshing ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 overflow-hidden bg-primary/10" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-r-full bg-primary/70" />
        </div>
      ) : null}
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Query results from approved invoice records</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-medium">Vendor</th>
            <th scope="col" className="px-4 py-2 font-medium">Invoice #</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Date</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Review</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Issues</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Source</th>
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
            : items.map((row) => (
                <tr key={row.documentId} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{row.vendorName ?? <span className="font-normal text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3">{row.invoiceNumber ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{row.invoiceDate ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatMoney(row.total, row.currency)}</td>
                  <td className="whitespace-nowrap px-4 py-3"><ReviewStatusBadge status={row.reviewStatus} /></td>
                  <td className="whitespace-nowrap px-4 py-3"><IssuesCell open={row.openIssues} /></td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      to={{
                        pathname: `/documents/${row.documentId}/review`,
                        search: `?from=query&focusField=${encodeURIComponent(row.totalSource?.fieldPath ?? "total")}`,
                      }}
                      state={{ querySearch }}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <MapPin className="size-4" aria-hidden="true" />
                      {row.totalSource?.hasBox ? "View total source" : "Open record"}
                    </Link>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
