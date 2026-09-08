import { Search, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

const TABLE_COLUMNS = ["Vendor", "Invoice #", "Date", "Total", "Review", "Issues", "Source"];
const EXAMPLE_LABELS = [
  "invoices from Acme above 500",
  "EUR invoices in 2024",
  "approved invoices over 1000",
  "Atlas Industrial",
];

export function QueryResultsLoading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Skeleton className="h-5 w-24 bg-muted/80" />
          <Skeleton className="h-5 w-36 bg-muted/80" />
          <Skeleton className="h-5 w-32 bg-muted/80" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 bg-muted/80" />
          <Skeleton className="h-8 w-24 bg-muted/80" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Loading query results</caption>
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {TABLE_COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap px-4 py-2.5 font-medium"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, row) => (
              <tr key={row} className="border-b border-border last:border-0">
                {TABLE_COLUMNS.map((column, col) => (
                  <td key={column} className="px-4 py-3">
                    <Skeleton
                      className={
                        col === 0
                          ? "h-4 w-full max-w-32 bg-muted/80"
                          : "h-4 w-full max-w-24 bg-muted/80"
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function QueryRouteLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6" aria-busy="true">
      <PageHeader
        icon={<Search className="size-6" aria-hidden="true" />}
        title="Query records"
        description="Ask in plain language — it becomes visible, editable filters."
      />

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="flex h-9 items-center rounded-md border border-input bg-background pl-9 pr-3 text-sm text-muted-foreground">
              e.g. invoices from Acme above 500 in USD
            </div>
          </div>
          <div className="inline-flex h-9 w-20 items-center justify-center rounded-md bg-primary/80 text-sm font-medium text-primary-foreground shadow-sm">
            Search
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {EXAMPLE_LABELS.map((label) => (
            <span
              key={label}
              className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
            Filters
            <Skeleton className="h-5 w-24 rounded-full bg-muted/80" />
          </span>
          <Skeleton className="h-4 w-12 bg-muted/80" />
        </div>
      </div>

      <QueryResultsLoading />
    </div>
  );
}
