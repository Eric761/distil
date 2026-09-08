import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import type { ReviewQueueItem } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ConfidenceChip,
  ProcessingStatusBadge,
  ReviewStatusBadge,
  ValidationChip,
} from "@/components/status-indicators";
import { cn, formatMoney } from "@/lib/utils";
import { useReviewQueue } from "./api";

/** Deep link into a document's review, focused on the specific field to fix. */
function reviewHref(item: ReviewQueueItem): string {
  return `/documents/${item.documentId}/review?from=queue&focusField=${encodeURIComponent(
    item.topIssue.fieldPath,
  )}`;
}

function QueueRowSkeleton({ index }: { index: number }) {
  return (
    <li>
      <Card className="border-l-4 border-l-muted">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
              {index % 2 === 0 ? <Skeleton className="h-4 w-16" /> : null}
            </div>
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-20 rounded-full" />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 shrink-0" />
        </CardContent>
      </Card>
    </li>
  );
}

function QueueRow({ item }: { item: ReviewQueueItem }) {
  const { topIssue } = item;
  const title = item.vendorName ?? item.originalFilename;
  const remaining = item.openIssueCount - 1;
  // A blocking issue (required/invalid/missing) gets a red rail; everything
  // else that merely needs a look gets an amber rail.
  const severe =
    topIssue.required || topIssue.validationState === "invalid" || topIssue.confidenceState === "missing";
  return (
    <li>
      <Card className={cn("border-l-4 transition-shadow hover:shadow-sm", severe ? "border-l-destructive" : "border-l-warning")}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{title}</span>
              {item.invoiceNumber ? (
                <span className="text-sm text-muted-foreground">· {item.invoiceNumber}</span>
              ) : null}
              <span className="text-sm tabular-nums text-muted-foreground">
                · {formatMoney(item.total, item.currency)}
              </span>
            </div>
            <p className="text-sm">{topIssue.message}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{topIssue.label}:</span>
              <ConfidenceChip state={topIssue.confidenceState} />
              <ValidationChip state={topIssue.validationState} />
              {topIssue.required ? <Badge tone="neutral">Required</Badge> : null}
              {topIssue.material ? <Badge tone="neutral">Material</Badge> : null}
              {remaining > 0 ? (
                <span className="text-xs text-muted-foreground">
                  +{remaining} more {remaining === 1 ? "issue" : "issues"} on this document
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <ProcessingStatusBadge status={item.processingStatus} />
              <ReviewStatusBadge status={item.reviewStatus} />
            </div>
          </div>
          <div className="shrink-0">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary shadow-none hover:border-primary/40 hover:bg-primary/10"
            >
              <Link to={reviewHref(item)}>
                Review issue <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export function ReviewQueuePage() {
  const navigate = useNavigate();
  const queue = useReviewQueue();
  const items = queue.data?.items ?? [];
  const next = items[0];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <PageHeader
        icon={<ListChecks className="size-6" aria-hidden="true" />}
        title="Review queue"
        description={
          queue.data
            ? queue.data.totalOpenIssues === 0
              ? "No open issues — every document is verified."
              : `${queue.data.totalOpenIssues} open ${
                  queue.data.totalOpenIssues === 1 ? "issue" : "issues"
                } across ${queue.data.totalDocuments} ${
                  queue.data.totalDocuments === 1 ? "document" : "documents"
                }, most consequential first.`
            : "Ranking the most consequential unverified fields across your documents."
        }
        actions={
          next ? (
            <Button onClick={() => navigate(reviewHref(next))} className="shadow-sm shadow-primary/20 hover:shadow-md">
              Review next issue <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      {queue.isLoading ? (
        <ul className="space-y-3" aria-busy="true" aria-label="Loading review queue">
          {Array.from({ length: 5 }).map((_, i) => (
            <QueueRowSkeleton key={i} index={i} />
          ))}
        </ul>
      ) : queue.isError ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6 text-sm">
            <p>Could not load the review queue. Your data is safe — please try again.</p>
            <Button variant="outline" size="sm" onClick={() => queue.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <CheckCircle2 className="size-8 text-emerald-500" aria-hidden="true" />
            <p className="font-medium">You&apos;re all caught up</p>
            <p className="text-sm text-muted-foreground">
              No documents need attention right now. New uploads that need review will appear here.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link to="/documents">Go to documents</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <QueueRow key={item.documentId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
