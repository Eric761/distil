import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, Download, Loader2, Search, SearchX, SlidersHorizontal } from "lucide-react";
import type { QueryFilters, QueryRequest } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatMoney } from "@/lib/utils";
import { useSearchRecords } from "./api";
import { FilterBuilder } from "./FilterBuilder";
import { QueryResultsLoading } from "./QueryLoadingState";
import { ResultsTable } from "./ResultsTable";
import { downloadTextFile, fetchAllResultRows, rowsToCsv, rowsToJson } from "./export";

const EXAMPLES = [
  "invoices from Acme above 500",
  "EUR invoices in 2024",
  "approved invoices over 1000",
  "Atlas Industrial",
];

function parseFilters(raw: string | null): QueryFilters | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as QueryFilters;
  } catch {
    return undefined;
  }
}

function cleanFilterValue(value: unknown): unknown | undefined {
  if (value === undefined || value === "") return undefined;
  if (Array.isArray(value)) return value.length > 0 ? value : undefined;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, child]) => [key, cleanFilterValue(child)] as const)
      .filter(([, child]) => child !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

function cleanFilters(filters: QueryFilters): QueryFilters {
  return (cleanFilterValue(filters) ?? {}) as QueryFilters;
}

export function QueryPage() {
  const [sp, setSp] = useSearchParams();
  const text = sp.get("q") ?? "";
  const rawFilters = sp.get("f");
  const parsedFilters = parseFilters(rawFilters);
  const urlFilters = parsedFilters ? cleanFilters(parsedFilters) : undefined;
  const page = Number(sp.get("page") ?? "1");
  const sort = (sp.get("sort") as QueryRequest["sort"]) ?? "approvedAt";
  const direction = (sp.get("dir") as QueryRequest["direction"]) ?? "desc";

  const [input, setInput] = React.useState(text);
  const [cleared, setCleared] = React.useState(false);
  React.useEffect(() => {
    setInput(text);
    if (text || rawFilters) setCleared(false);
  }, [rawFilters, text]);

  const activeText = cleared ? "" : text;
  const activeUrlFilters = cleared ? undefined : urlFilters;
  const hasUrlFilters = Boolean(activeUrlFilters && Object.keys(activeUrlFilters).length > 0);
  const request: QueryRequest = {
    ...(activeText ? { text: activeText } : {}),
    ...(activeUrlFilters ? { filters: activeUrlFilters } : {}),
    page,
    pageSize: 20,
    sort,
    direction,
    acknowledgeWarnings: true,
  };
  const hasExplicitSearch = Boolean(activeText) || hasUrlFilters;
  const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useSearchRecords(request, true);
  const hasVisibleRows = (data?.items.length ?? 0) > 0;
  const showUpdating = isPlaceholderData && !isLoading;
  const showResultsSkeleton = isLoading || (showUpdating && !hasVisibleRows);

  const runText = (value: string) => {
    setCleared(false);
    const next = new URLSearchParams();
    if (value) next.set("q", value);
    next.set("page", "1");
    setSp(next, { replace: false });
  };

  const applyFilters = (filters: QueryFilters) => {
    setCleared(false);
    const cleaned = cleanFilters(filters);
    const next = new URLSearchParams(sp);
    if (Object.keys(cleaned).length > 0) next.set("f", JSON.stringify(cleaned));
    else next.delete("f");
    next.set("page", "1");
    setSp(next, { replace: true });
  };

  const clearAll = () => {
    setCleared(true);
    setInput("");
    setSp(new URLSearchParams(), { replace: true });
  };

  const setPage = (p: number) => {
    const next = new URLSearchParams(sp);
    next.set("page", String(p));
    setSp(next, { replace: true });
  };

  const [exporting, setExporting] = React.useState<"csv" | "json" | null>(null);
  const [exportError, setExportError] = React.useState(false);
  const runExport = async (format: "csv" | "json") => {
    setExporting(format);
    setExportError(false);
    try {
      const rows = await fetchAllResultRows(request);
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        downloadTextFile(`distil-records-${stamp}.csv`, "text/csv;charset=utf-8", rowsToCsv(rows));
      } else {
        downloadTextFile(`distil-records-${stamp}.json`, "application/json", rowsToJson(rows));
      }
    } catch {
      setExportError(true);
    } finally {
      setExporting(null);
    }
  };

  const editableFilters: QueryFilters = activeUrlFilters ?? (activeText ? data?.interpretation.filters : {}) ?? {};
  const activeInterpretation =
    data && hasExplicitSearch && (activeText || Object.keys(editableFilters).length > 0)
      ? data.interpretation
      : null;

  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const activeFilterCount = Object.keys(editableFilters).length;
  // If the parser couldn't map the query, open the panel so the "edit the
  // filters below" guidance actually points at something visible.
  React.useEffect(() => {
    if (activeInterpretation?.needsClarification) setFiltersOpen(true);
  }, [activeInterpretation?.needsClarification]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader
        icon={<Search className="size-6" aria-hidden="true" />}
        title="Query records"
        description="Ask in plain language — it becomes visible, editable filters. Approved records are searched by default."
      />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runText(input);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. invoices from Acme above 500 in USD"
            className="pl-8"
            aria-label="Natural language query"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            className="rounded-full border border-border px-2 py-0.5 hover:bg-muted"
            onClick={() => {
              setInput(ex);
              runText(ex);
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Interpretation */}
      {activeInterpretation ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {activeInterpretation.originalText ? (
            <p className="text-muted-foreground">
              Interpreted “{activeInterpretation.originalText}” as:
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {activeInterpretation.chips.length > 0 ? (
              activeInterpretation.chips.map((chip) => (
                <Badge key={chip.key} tone="info">
                  {chip.label}: {chip.display}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">No filters yet.</span>
            )}
          </div>
          {activeInterpretation.warnings.map((w, i) => (
            <p key={i} className="flex items-center gap-1 text-amber-700">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> {w}
            </p>
          ))}
          {activeInterpretation.needsClarification ? (
            <p className="text-amber-700">
              No filters were recognized. Edit the filters below and apply them.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Collapsible filter panel: summarize what's active, expand to edit. */}
      <div className="space-y-2">
        <div className="rounded-lg border border-border bg-card">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="query-filter-panel"
            className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-2 font-medium">
              <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
              Filters
              {activeFilterCount > 0 ? (
                <Badge tone="info">{activeFilterCount} active</Badge>
              ) : (
                <span className="font-normal text-muted-foreground">None applied</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{filtersOpen ? "Hide" : "Edit"}</span>
              <ChevronDown
                className={cn("size-4 shrink-0 text-muted-foreground transition-transform", filtersOpen && "rotate-180")}
                aria-hidden="true"
              />
            </span>
          </button>
        </div>
        {filtersOpen ? (
          <div id="query-filter-panel">
            <FilterBuilder value={editableFilters} onApply={applyFilters} onClear={clearAll} />
          </div>
        ) : null}
      </div>

      {/* Results */}
      {isError ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm">
            <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
            <span className="flex-1">The query failed, but your filters are preserved.</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : showResultsSkeleton ? (
        <QueryResultsLoading />
      ) : data && data.items.length === 0 && !showUpdating ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center text-sm">
            <div className="rounded-full bg-muted p-3">
              <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium text-foreground">No records match these filters.</p>
            {data.interpretation.chips.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className="text-muted-foreground">Active:</span>
                {data.interpretation.chips.map((chip) => (
                  <Badge key={chip.key} tone="neutral">
                    {chip.label}: {chip.display}
                  </Badge>
                ))}
              </div>
            ) : null}
            <p className="text-muted-foreground">
              Try widening the amount range or dates, changing the currency, or relaxing the review status.
            </p>
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear all filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {data && data.items.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-medium">
                  {(data.summary?.totalCount ?? data.pagination.total).toLocaleString()}{" "}
                  {(data.summary?.totalCount ?? data.pagination.total) === 1 ? "record" : "records"}
                </span>
                {data.summary && data.summary.byCurrency.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    {data.summary.byCurrency.map((bucket) => (
                      <span key={bucket.currency ?? "none"} className="whitespace-nowrap">
                        <span className="font-medium tabular-nums text-foreground">
                          {formatMoney(bucket.total, bucket.currency)}
                        </span>{" "}
                        total{bucket.currency ? ` (${bucket.currency})` : ""}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {exportError ? <span className="text-xs text-destructive">Export failed</span> : null}
                <Button variant="outline" size="sm" onClick={() => void runExport("csv")} disabled={exporting !== null}>
                  <Download className="size-4" aria-hidden="true" />
                  {exporting === "csv" ? "Exporting…" : "Export CSV"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void runExport("json")} disabled={exporting !== null}>
                  <Download className="size-4" aria-hidden="true" />
                  {exporting === "json" ? "Exporting…" : "Export JSON"}
                </Button>
              </div>
            </div>
          ) : null}
          {showUpdating && hasVisibleRows ? (
            <div className="flex justify-end text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1" role="status">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Updating…
              </span>
            </div>
          ) : null}
          <ResultsTable items={data?.items ?? []} isLoading={isLoading} isFetching={isFetching} isRefreshing={showUpdating} querySearch={sp.toString() ? `?${sp.toString()}` : ""} />
          {data && data.pagination.totalPages > 1 ? (
            <nav className="flex items-center justify-between text-sm" aria-label="Results pagination">
              <span className="text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} records
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
