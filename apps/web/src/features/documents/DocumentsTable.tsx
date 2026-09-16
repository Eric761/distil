import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, RefreshCw } from "lucide-react";
import type { DocumentSummary } from "@invoice/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProcessingStatusBadge, ReviewStatusBadge } from "@/components/status-indicators";
import { DOCUMENT_FORMAT_LABELS } from "@/lib/document-summary-line";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
import { useProcessDocument } from "./api";

/**
 * The attention rail is reserved for the *exceptional* rows that are stuck and
 * need intervention beyond the normal review flow — a failed extraction (red)
 * or a partial one (amber). We deliberately do NOT rail ordinary "needs review"
 * rows: that's the common state and is already shown by the Review badge and
 * the Issues column, so railing it would turn the signal into noise.
 */
function attentionTone(doc: DocumentSummary): "danger" | "warning" | null {
  if (doc.processingStatus === "failed") return "danger";
  if (doc.processingStatus === "partial") return "warning";
  return null;
}

function DocumentTypeCell({ doc }: { doc: DocumentSummary }) {
  const category = doc.schemaName ?? (doc.documentType === "invoice" ? "Invoice" : "Unclassified");
  return (
    <div className="min-w-0 space-y-1">
      <Badge tone="info">
        {DOCUMENT_FORMAT_LABELS[doc.documentFormat]}
      </Badge>
      <div className="truncate text-xs text-muted-foreground" title={category}>
        {category}
      </div>
    </div>
  );
}

/** Schema-aware preview: invoice business values or the generic schema's best summary fields. */
function SummaryCell({ doc }: { doc: DocumentSummary }) {
  if (doc.documentType === "invoice") {
    return (
      <div className="min-w-0">
        <div className="truncate font-medium" title={doc.vendorName ?? undefined}>
          {doc.vendorName ?? <span className="font-normal text-muted-foreground">—</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {[doc.total ? formatMoney(doc.total, doc.currency) : null, doc.invoiceNumber]
            .filter(Boolean)
            .join(" · ") || "No summary available"}
        </div>
      </div>
    );
  }

  const values = doc.summaryValues.filter((value) => value.value != null && value.value !== "").slice(0, 2);
  if (values.length === 0) return <span className="text-muted-foreground">No summary available</span>;
  return (
    <div className="min-w-0 space-y-0.5">
      {values.map((value) => (
        <div key={value.key} className="truncate" title={`${value.label}: ${value.value}`}>
          <span className="text-muted-foreground">{value.label}: </span>
          <span className="font-medium">{value.value}</span>
        </div>
      ))}
    </div>
  );
}

type RowActionsProps = Readonly<{
  doc: DocumentSummary;
}>;

/**
 * Inline Retry for failed/partial docs. Chevron is a visual affordance only —
 * the row handles navigation (see DocumentRow).
 */
function RowActions({ doc }: RowActionsProps) {
  const process = useProcessDocument(doc.id);
  const retryable = doc.processingStatus === "failed" || doc.processingStatus === "partial";
  const showRetry = retryable || process.isPending;
  const retryLabel = process.isPending ? "Retrying…" : process.isError ? "Try again" : "Retry";
  const retryTitle = process.isPending
    ? "Extraction retry in progress"
    : process.isError
      ? "Retry failed. Try extraction again."
      : `Retry ${doc.processingStatus} extraction`;
  return (
    <div className="flex items-center justify-end gap-1.5">
      {showRetry ? (
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 gap-1.5 px-2.5 font-medium",
            doc.processingStatus === "failed" &&
              "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
            doc.processingStatus === "partial" &&
              "bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 hover:text-amber-900",
            process.isError && "ring-1 ring-inset ring-destructive/30",
          )}
          disabled={process.isPending}
          title={retryTitle}
          aria-label={retryTitle}
          onClick={(e) => {
            e.stopPropagation();
            process.mutate(true);
          }}
        >
          <RefreshCw className={cn("size-4", process.isPending && "animate-spin")} aria-hidden="true" />
          {retryLabel}
        </Button>
      ) : null}
      {showRetry ? <span className="h-5 w-px bg-border" aria-hidden="true" /> : null}
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

type DocumentRowProps = Readonly<{
  doc: DocumentSummary;
}>;

function DocumentRow({ doc }: DocumentRowProps) {
  const navigate = useNavigate();
  const tone = attentionTone(doc);
  const reviewPath = `/documents/${doc.id}/review`;
  const openReview = () => navigate(reviewPath);

  return (
    <tr
      data-attention={tone ?? undefined}
      onClick={openReview}
      className="group cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40"
    >
      <td
        className={cn(
          "border-l-2 border-l-transparent px-4 py-3",
          tone === "danger" && "border-l-destructive",
          tone === "warning" && "border-l-warning",
        )}
      >
        <Link
          to={reviewPath}
          title={doc.originalFilename}
          onClick={(e) => e.stopPropagation()}
          className="line-clamp-2 font-medium text-primary hover:underline"
        >
          {doc.originalFilename}
        </Link>
        {doc.invoiceNumber ? (
          <div className="truncate text-xs text-muted-foreground">{doc.invoiceNumber}</div>
        ) : null}
      </td>
      <td className="px-4 py-3"><DocumentTypeCell doc={doc} /></td>
      <td className="px-4 py-3"><SummaryCell doc={doc} /></td>
      <td className="px-4 py-3">
        <ProcessingStatusBadge status={doc.processingStatus} phase={doc.processingPhase} compact />
      </td>
      <td className="px-4 py-3">
        <ReviewStatusBadge status={doc.reviewStatus} compact />
      </td>
      <td className="whitespace-nowrap px-4 py-3"><IssueCell doc={doc} /></td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(doc.updatedAt)}</td>
      <td className="px-3 py-3 text-right">
        <RowActions doc={doc} />
      </td>
    </tr>
  );
}

type IssueCellProps = Readonly<{
  doc: DocumentSummary;
}>;

function IssueCell({ doc }: IssueCellProps) {
  if (doc.openIssues === null) return <span className="text-muted-foreground">—</span>;
  if (doc.openIssues === 0) return <span className="text-success">All clear</span>;
  return (
    <span className="text-amber-700">
      {doc.openIssues} to review
    </span>
  );
}

type DocumentsTableProps = Readonly<{
  items: DocumentSummary[];
  isLoading: boolean;
  isFetching: boolean;
  /** True while showing stale rows for a new query (filter/search/sort/page). */
  isRefreshing?: boolean;
}>;

export function DocumentsTable({
  items,
  isLoading,
  isFetching,
  isRefreshing = false,
}: DocumentsTableProps) {
  return (
    <div className="relative overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-card">
      {isRefreshing ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 overflow-hidden bg-primary/10" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-r-full bg-primary/70" />
        </div>
      ) : null}
      {/* table-fixed + colgroup locks column widths so changing badge text or a
          Retry button appearing/disappearing can never reflow the table. */}
      <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm">
        <caption className="sr-only">Uploaded documents and their extraction and review status</caption>
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[12%]" />
          <col className="w-[20%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="border-l-2 border-l-transparent px-4 py-2.5 font-medium">Document</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Summary</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Extraction</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Review</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Issues</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Updated</th>
            <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody aria-busy={isFetching || isRefreshing}>
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className={cn("px-4 py-3", j === 0 && "border-l-2 border-l-transparent")}>
                      <Skeleton className="h-4 w-full max-w-[8rem]" />
                    </td>
                  ))}
                </tr>
              ))
            : items.map((doc) => <DocumentRow key={doc.id} doc={doc} />)}
        </tbody>
      </table>
    </div>
  );
}
