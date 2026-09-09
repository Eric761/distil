import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Compass, FileStack, Loader2, Plus, RefreshCw, SearchX } from "lucide-react";
import type { DocumentListQuery, ProcessingStatus, ReviewStatus } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useDocumentList } from "./api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentsSummary, DocumentsSummarySkeleton } from "./DocumentsSummary";
import { DocumentsTable } from "./DocumentsTable";
import { DocumentsToolbar, type ToolbarValue } from "./DocumentsToolbar";
import { SampleGallery } from "./SampleGallery";
import { DemoWalkthroughBanner, DemoWalkthroughPanel, useDemoWalkthrough } from "./demo-walkthrough";
import { UploadDialog } from "./UploadDialog";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

function buildParams(sp: URLSearchParams): Partial<DocumentListQuery> {
  const sort = (sp.get("sort") as DocumentListQuery["sort"]) ?? "updatedAt";
  // Guard against malformed ?page= values (NaN, 0, negatives) from hand-edited URLs.
  const parsedPage = Math.trunc(Number(sp.get("page")));
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const parsedPageSize = Math.trunc(Number(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)));
  const pageSize = PAGE_SIZE_OPTIONS.some((option) => option === parsedPageSize)
    ? parsedPageSize
    : DEFAULT_PAGE_SIZE;
  const params: Partial<DocumentListQuery> = {
    page,
    pageSize,
    sort,
    // Names read naturally A→Z; recency and amount are most useful newest/largest first.
    direction: sort === "vendorName" ? "asc" : "desc",
  };
  const search = sp.get("search");
  if (search) params.search = search;
  const review = sp.get("review");
  if (review && review !== "all") params.reviewStatus = [review as ReviewStatus];
  const processing = sp.get("processing");
  if (processing && processing !== "all") params.processingStatus = [processing as ProcessingStatus];
  return params;
}

export function DocumentsPage() {
  const { showBanner, showPanel, openGuide, dismiss: dismissWalkthrough } = useDemoWalkthrough();
  const [sp, setSp] = useSearchParams();
  const params = React.useMemo(() => buildParams(sp), [sp]);
  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } = useDocumentList(params);

  const hasFilters = Boolean(sp.get("search") || sp.get("review") || sp.get("processing"));
  const isFirstTime = !isLoading && data?.pagination.total === 0 && !hasFilters;
  const hasVisibleRows = (data?.items.length ?? 0) > 0;
  const showUpdating = isPlaceholderData && !isLoading;
  const showTableSkeleton = isLoading || (showUpdating && !hasVisibleRows);

  const toolbarValue: ToolbarValue = {
    search: sp.get("search") ?? "",
    reviewStatus: (sp.get("review") as ToolbarValue["reviewStatus"]) ?? "all",
    processingStatus: (sp.get("processing") as ToolbarValue["processingStatus"]) ?? "all",
    sort: (sp.get("sort") as ToolbarValue["sort"]) ?? "updatedAt",
  };

  const update = (next: Partial<ToolbarValue>) => {
    const merged = new URLSearchParams(sp);
    merged.set("page", "1");
    if (next.search !== undefined) {
      next.search ? merged.set("search", next.search) : merged.delete("search");
    }
    if (next.reviewStatus !== undefined) {
      next.reviewStatus === "all" ? merged.delete("review") : merged.set("review", next.reviewStatus);
    }
    if (next.processingStatus !== undefined) {
      next.processingStatus === "all" ? merged.delete("processing") : merged.set("processing", next.processingStatus);
    }
    if (next.sort !== undefined) merged.set("sort", next.sort);
    setSp(merged, { replace: true });
  };

  const setPage = (page: number) => {
    const merged = new URLSearchParams(sp);
    merged.set("page", String(page));
    setSp(merged, { replace: true });
  };

  const setPageSize = (pageSize: number) => {
    const merged = new URLSearchParams(sp);
    merged.set("page", "1");
    pageSize === DEFAULT_PAGE_SIZE ? merged.delete("pageSize") : merged.set("pageSize", String(pageSize));
    setSp(merged, { replace: true });
  };

  let mainContent: React.ReactNode;
  if (isError) {
    mainContent = (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm">
          <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Could not load documents.</p>
            <p className="text-muted-foreground">{(error as Error)?.message ?? "Please try again."} Your data is safe.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="size-4" aria-hidden="true" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  } else if (data && data.items.length === 0 && !showUpdating) {
    mainContent = (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="rounded-full bg-muted p-3">
            <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="font-medium">No documents match these filters</p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Try widening your search or clearing the filters to see everything you&apos;ve uploaded.
          </p>
          <Button variant="outline" size="sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>
            Clear filters
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    mainContent = (
      <>
        <DocumentsTable
          items={showTableSkeleton ? [] : data?.items ?? []}
          isLoading={showTableSkeleton}
          isFetching={isFetching}
          isRefreshing={showUpdating && hasVisibleRows}
        />
        {data && data.pagination.total > 0 ? (
          <nav className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination">
            <span className="text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} documents
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="documents-page-size" className="text-xs font-medium text-muted-foreground">
                Rows per page
              </label>
              <Select
                value={String(data.pagination.pageSize)}
                onValueChange={(v) => setPageSize(Number(v))}
              >
                <SelectTrigger
                  id="documents-page-size"
                  aria-label="Rows per page"
                  className="h-8 w-[4.5rem] px-2 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)} className="text-xs">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={data.pagination.page <= 1}
                onClick={() => setPage(data.pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => setPage(data.pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </nav>
        ) : null}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader
        icon={<FileStack className="size-6" aria-hidden="true" />}
        title="Documents"
        description="Verify extraction, resolve blockers, and approve trusted records."
        descriptionClassName="max-w-none"
        actions={
          <>
            {!showBanner ? (
              <Button variant="outline" onClick={openGuide}>
                <Compass className="size-4" aria-hidden="true" /> Evaluator guide
              </Button>
            ) : null}
            <UploadDialog>
              <Button>
                <Plus className="size-4" aria-hidden="true" /> Upload
              </Button>
            </UploadDialog>
          </>
        }
      />

      {showBanner ? (
        <DemoWalkthroughBanner onStart={openGuide} onDismiss={dismissWalkthrough} />
      ) : null}

      {showPanel ? <DemoWalkthroughPanel onDismiss={dismissWalkthrough} /> : null}

      {isFirstTime ? (
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-primary/10 p-3">
                <FileStack className="size-6 text-primary" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold">Start with a sample invoice</h2>
              <p className="max-w-prose text-sm text-muted-foreground">
                Each sample demonstrates a real extraction challenge — clean data, different terminology,
                a missing field, conflicting totals, nested line items, or a recoverable failure. Load one
                to see the full review-to-query flow, or upload your own PDF.
              </p>
            </div>
            <SampleGallery />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data ? (
            <DocumentsSummary
              total={data.pagination.total}
              activeProcessingCount={data.activeProcessingCount}
              isFiltered={hasFilters}
            />
          ) : (
            <DocumentsSummarySkeleton isFiltered={hasFilters} />
          )}
          <DocumentsToolbar value={toolbarValue} onChange={update} onReset={() => setSp(new URLSearchParams(), { replace: true })} />

          {showUpdating ? (
            <div className="flex justify-end text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1" role="status">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Updating…
              </span>
            </div>
          ) : null}

          {mainContent}
        </div>
      )}
    </div>
  );
}
