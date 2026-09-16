import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Compass,
  Download,
  Loader2,
  Search,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { QueryFilters, QueryRequest, QueryResultRow, QueryTrustScope } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatMoney } from "@/lib/utils";
import { useSearchRecords } from "./api";
import { DetailsDrawer } from "./DetailsDrawer";
import { FilterBuilder } from "./FilterBuilder";
import { QueryResultsLoading } from "./QueryLoadingState";
import { ResultsTable } from "./ResultsTable";
import { downloadTextFile, fetchAllResultRows, rowsToCsv, rowsToJson } from "./export";

const EXAMPLES = [
  "Orbital Cloud Migration",
  "Blue Harbor Analytics",
  "approved invoices over 1000",
  "support tickets High priority",
];

const TRUST_SCOPE_LABELS: Record<QueryTrustScope, string> = {
  approved: "Last approved snapshots",
  current: "Current / unapproved values",
};

const TRUST_SCOPE_HINTS: Record<QueryTrustScope, string> = {
  approved: "Last approved values; pending updates don't replace them.",
  current: "Latest extractions, including unapproved values.",
};

const SORT_LABELS: Record<QueryRequest["sort"], string> = {
  updatedAt: "Recently updated",
  approvedAt: "Recently approved",
  filename: "Document name",
  schemaName: "Schema name",
  total: "Total amount",
  invoiceDate: "Invoice date",
  vendorName: "Vendor name",
};

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

export function ExplorePage() {
  const [sp, setSp] = useSearchParams();
  const [detailsRow, setDetailsRow] = React.useState<QueryResultRow | null>(null);
  const text = sp.get("q") ?? "";
  const rawFilters = sp.get("f");
  const parsedFilters = parseFilters(rawFilters);
  const urlFilters = parsedFilters ? cleanFilters(parsedFilters) : undefined;
  const trustScope: QueryTrustScope = sp.get("trust") === "current" ? "current" : "approved";
  const parsedPage = Math.trunc(Number(sp.get("page") ?? "1"));
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const sortParam = sp.get("sort");
  const sort: QueryRequest["sort"] =
    sortParam === "total" ||
    sortParam === "invoiceDate" ||
    sortParam === "vendorName" ||
    sortParam === "filename" ||
    sortParam === "schemaName" ||
    sortParam === "approvedAt" ||
    sortParam === "updatedAt"
      ? sortParam
      : trustScope === "current"
        ? "updatedAt"
        : "approvedAt";
  const direction: QueryRequest["direction"] = sp.get("dir") === "asc" ? "asc" : "desc";

  const [input, setInput] = React.useState(text);
  const [cleared, setCleared] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    setInput(text);
    if (text || rawFilters) setCleared(false);
  }, [rawFilters, text]);

  const queryIdentity = `${text}|${rawFilters ?? ""}|${page}|${sort}|${direction}|${trustScope}`;
  React.useEffect(() => {
    setSelectedIds(new Set());
    setDetailsRow(null);
  }, [queryIdentity]);

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
    trustScope,
    acknowledgeWarnings: true,
  };
  const hasExplicitSearch = Boolean(activeText) || hasUrlFilters;
  const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useSearchRecords(request, true);
  const hasVisibleRows = (data?.items.length ?? 0) > 0;
  const showUpdating = isPlaceholderData && !isLoading;
  const showResultsSkeleton = isLoading || (showUpdating && !hasVisibleRows);

  const runText = (value: string) => {
    setCleared(false);
    const next = new URLSearchParams(sp);
    if (value) next.set("q", value);
    else next.delete("q");
    next.delete("f");
    next.set("page", "1");
    setSp(next, { replace: false });
  };

  const applyFilters = (filters: QueryFilters) => {
    setCleared(false);
    setSelectedIds(new Set());
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
    setSelectedIds(new Set());
    const next = new URLSearchParams();
    if (trustScope === "current") next.set("trust", "current");
    setSp(next, { replace: true });
  };

  const setPage = (p: number) => {
    const next = new URLSearchParams(sp);
    next.set("page", String(p));
    setSelectedIds(new Set());
    setSp(next, { replace: true });
  };

  const setSort = (value: QueryRequest["sort"]) => {
    const next = new URLSearchParams(sp);
    next.set("sort", value);
    next.set("page", "1");
    setSelectedIds(new Set());
    setSp(next, { replace: true });
  };

  const toggleDirection = () => {
    const next = new URLSearchParams(sp);
    next.set("dir", direction === "desc" ? "asc" : "desc");
    next.set("page", "1");
    setSelectedIds(new Set());
    setSp(next, { replace: true });
  };

  const setTrustScope = (scope: QueryTrustScope) => {
    const next = new URLSearchParams(sp);
    if (scope === "current") next.set("trust", "current");
    else next.delete("trust");
    next.set("page", "1");
    setSelectedIds(new Set());
    setSp(next, { replace: true });
  };

  const pageIds = React.useMemo(() => (data?.items ?? []).map((row) => row.documentId), [data?.items]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const selectedRows = React.useMemo(
    () => (data?.items ?? []).filter((row) => selectedIds.has(row.documentId)),
    [data?.items, selectedIds],
  );
  const selectedSchemaCount = new Set(selectedRows.map((row) => row.schemaName ?? row.documentType)).size;
  const canExportSelectedCsv = selectedRows.length > 0 && selectedSchemaCount <= 1;

  const toggleRow = (documentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const [exporting, setExporting] = React.useState<"csv" | "json" | null>(null);
  const [exportError, setExportError] = React.useState(false);
  const runExport = async (format: "csv" | "json", rowsOverride?: QueryResultRow[]) => {
    setExporting(format);
    setExportError(false);
    try {
      const rows = rowsOverride ?? await fetchAllResultRows(request);
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
        icon={<Compass className="size-6" aria-hidden="true" />}
        title="Explore documents"
        description="One row per document. Ask in plain language — it becomes visible, editable filters. Approved records are searched by default."
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
            placeholder="e.g. Orbital Cloud Migration or invoices from Acme above 500 in USD"
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            trustScope === "approved" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-800",
          )}
          aria-hidden="true"
        >
          <ShieldCheck className="size-4" />
        </div>
        <label className="shrink-0 text-xs font-medium text-muted-foreground" htmlFor="trust-scope">
          Trust scope
        </label>
        <Select value={trustScope} onValueChange={(value) => setTrustScope(value as QueryTrustScope)}>
          <SelectTrigger
            id="trust-scope"
            className="h-8 w-auto shrink-0 min-w-[15.5rem] max-w-none bg-background text-foreground [&>span]:text-foreground"
            aria-label="Trust scope"
            aria-describedby="trust-scope-hint"
          >
            <SelectValue placeholder="Choose trust scope">{TRUST_SCOPE_LABELS[trustScope]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approved">{TRUST_SCOPE_LABELS.approved}</SelectItem>
            <SelectItem value="current">{TRUST_SCOPE_LABELS.current}</SelectItem>
          </SelectContent>
        </Select>
        <p
          id="trust-scope-hint"
          className="min-w-[12rem] flex-1 truncate text-xs text-muted-foreground"
          title={TRUST_SCOPE_HINTS[trustScope]}
        >
          {TRUST_SCOPE_HINTS[trustScope]}
        </p>
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
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="inline-flex h-7 items-center rounded-md bg-primary/10 px-2 text-xs font-semibold text-foreground">
                  {(data.summary?.totalCount ?? data.pagination.total).toLocaleString()}
                  <span className="ml-1 font-normal text-muted-foreground">
                    {(data.summary?.totalCount ?? data.pagination.total) === 1 ? "record" : "records"}
                  </span>
                </span>
                {data.summary && data.summary.byCurrency.length > 0 ? (
                  <>
                    <span className="hidden h-4 w-px bg-border sm:inline" aria-hidden="true" />
                    {data.summary.byCurrency.map((bucket) => (
                      <span
                        key={bucket.currency ?? "none"}
                        className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 text-xs"
                        title={`${bucket.currency ?? "No currency"} total`}
                      >
                        <span className="shrink-0 font-medium text-muted-foreground">
                          {bucket.currency ?? "—"}
                        </span>
                        <span className="truncate font-semibold tabular-nums text-foreground">
                          {formatMoney(bucket.total, bucket.currency)}
                        </span>
                      </span>
                    ))}
                  </>
                ) : null}
                {data.summary?.bySchema && data.summary.bySchema.length > 1 ? (
                  <>
                    <span className="hidden h-4 w-px bg-border sm:inline" aria-hidden="true" />
                    {data.summary.bySchema.slice(0, 3).map((bucket) => (
                      <span
                        key={`${bucket.schemaKey}:${bucket.schemaName ?? ""}`}
                        className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 text-xs"
                        title={`${bucket.count} ${bucket.schemaName ?? bucket.schemaKey} records`}
                      >
                        <span className="truncate font-medium text-muted-foreground">
                          {bucket.schemaName ?? bucket.schemaKey}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">{bucket.count}</span>
                      </span>
                    ))}
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <Select value={sort} onValueChange={(value) => setSort(value as QueryRequest["sort"])}>
                  <SelectTrigger
                    className="h-8 w-auto shrink-0 min-w-[11.5rem] bg-background text-foreground [&>span]:text-foreground"
                    aria-label="Sort results"
                  >
                    <SelectValue>{SORT_LABELS[sort]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updatedAt">{SORT_LABELS.updatedAt}</SelectItem>
                    <SelectItem value="approvedAt">{SORT_LABELS.approvedAt}</SelectItem>
                    <SelectItem value="filename">{SORT_LABELS.filename}</SelectItem>
                    <SelectItem value="schemaName">{SORT_LABELS.schemaName}</SelectItem>
                    <SelectItem value="total">{SORT_LABELS.total}</SelectItem>
                    <SelectItem value="invoiceDate">{SORT_LABELS.invoiceDate}</SelectItem>
                    <SelectItem value="vendorName">{SORT_LABELS.vendorName}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={toggleDirection}
                  aria-label={direction === "desc" ? "Sort ascending" : "Sort descending"}
                  title={direction === "desc" ? "Descending" : "Ascending"}
                >
                  {direction === "desc"
                    ? <ArrowDown className="size-4" aria-hidden="true" />
                    : <ArrowUp className="size-4" aria-hidden="true" />}
                </Button>
                {selectedIds.size > 0 ? (
                  <>
                    <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setSelectedIds(new Set())}>
                      Clear
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => void runExport("json", selectedRows)}
                      disabled={exporting !== null}
                    >
                      <Download className="size-4" aria-hidden="true" />
                      JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => void runExport("csv", selectedRows)}
                      disabled={exporting !== null || !canExportSelectedCsv}
                      title={canExportSelectedCsv ? undefined : "CSV export requires a compatible single-schema selection."}
                    >
                      <Download className="size-4" aria-hidden="true" />
                      CSV
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => void runExport("csv")} disabled={exporting !== null}>
                      <Download className="size-4" aria-hidden="true" />
                      {exporting === "csv" ? "…" : "CSV"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => void runExport("json")} disabled={exporting !== null}>
                      <Download className="size-4" aria-hidden="true" />
                      {exporting === "json" ? "…" : "JSON"}
                    </Button>
                  </>
                )}
                {exportError ? <span className="text-xs text-destructive">Export failed</span> : null}
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
          <ResultsTable
            items={data?.items ?? []}
            isLoading={isLoading}
            isFetching={isFetching}
            isRefreshing={showUpdating}
            querySearch={sp.toString() ? `?${sp.toString()}` : ""}
            onOpenDetails={setDetailsRow}
            selectedIds={selectedIds}
            onToggleRow={toggleRow}
            allPageSelected={allPageSelected}
            onTogglePage={togglePage}
            trustScope={trustScope}
          />
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

      <DetailsDrawer
        row={detailsRow}
        onOpenChange={(next) => {
          if (!next) setDetailsRow(null);
        }}
        querySearch={sp.toString() ? `?${sp.toString()}` : ""}
      />
    </div>
  );
}
