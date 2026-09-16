import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import type { ReviewQueueItem, ReviewQueueResponse } from "@invoice/contracts";
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

type IssueSeverity = "blocking" | "verify";

/** Deep link into a document's review, focused on the specific field to fix. */
function reviewHref(item: ReviewQueueItem): string {
  return `/documents/${item.documentId}/review?from=queue&focusField=${encodeURIComponent(
    item.topIssue.fieldPath,
  )}`;
}

function issueSeverity(item: ReviewQueueItem): IssueSeverity {
  const { topIssue } = item;
  return topIssue.required || topIssue.validationState === "invalid" || topIssue.confidenceState === "missing"
    ? "blocking"
    : "verify";
}

function issueSeverityLabel(severity: IssueSeverity): string {
  return severity === "blocking" ? "Blocking approval" : "Needs verification";
}

function issueReason(issue: ReviewQueueItem["topIssue"]): string {
  if (issue.validationState === "invalid") return "Validation failed";
  if (issue.confidenceState === "conflicting") return "Conflicting values";
  if (issue.confidenceState === "missing") return issue.required ? "Required value missing" : "Value not found";
  if (issue.confidenceState === "low") return "Low confidence";
  if (issue.confidenceState === "inferred") return "Inferred value";
  if (issue.validationState === "warning") return "Validation warning";
  return "Review suggested";
}

function itemTitle(item: ReviewQueueItem): string {
  return item.vendorName ?? item.originalFilename;
}

function itemSummary(item: ReviewQueueItem): string {
  return [item.invoiceNumber, item.total ? formatMoney(item.total, item.currency) : null].filter(Boolean).join(" · ");
}

type QueueRowSkeletonProps = Readonly<{
  index: number;
}>;

function QueueRowSkeleton({ index }: QueueRowSkeletonProps) {
  return (
    <li>
      <Card className="border-l-4 border-l-muted">
        <CardContent className="grid gap-3.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-full max-w-xl" />
            <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md bg-muted/30 px-2.5 py-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className={cn("h-5 rounded-full", i === index % 3 ? "w-28" : "w-20")} />
              ))}
            </div>
          </div>
          <Skeleton className="h-8 w-32 shrink-0" />
        </CardContent>
      </Card>
    </li>
  );
}

type QueueRowProps = Readonly<{
  item: ReviewQueueItem;
}>;

function QueueRow({ item }: QueueRowProps) {
  const { topIssue } = item;
  const severity = issueSeverity(item);
  const blocking = severity === "blocking";
  const summary = itemSummary(item);
  const issueCountLabel = `${item.openIssueCount} open ${item.openIssueCount === 1 ? "issue" : "issues"}`;
  return (
    <li>
      <Card className={cn("border-l-4 transition-shadow hover:shadow-sm", blocking ? "border-l-destructive" : "border-l-warning")}>
        <CardContent className="grid gap-3.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Badge tone={blocking ? "danger" : "warning"} className="px-2 py-0.5">
                {issueSeverityLabel(severity)}
              </Badge>
              <span className="min-w-0 max-w-full truncate font-medium sm:max-w-[18rem] md:max-w-[24rem]" title={itemTitle(item)}>
                {itemTitle(item)}
              </span>
              {summary ? <span className="text-xs tabular-nums text-muted-foreground">· {summary}</span> : null}
              <Badge tone="neutral" className="px-2 py-0.5">
                {issueCountLabel}
              </Badge>
            </div>
            <p className="line-clamp-1 text-sm font-medium text-foreground" title={topIssue.message}>
              {topIssue.message}
            </p>
            <div className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-muted/30 px-2.5 py-1.5 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="font-medium text-muted-foreground">Field</span>
                <span className="font-medium text-foreground">{topIssue.label}</span>
              </span>
              <span className="hidden h-4 w-px bg-border sm:inline" aria-hidden="true" />
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-muted-foreground">Checks</span>
                <ConfidenceChip state={topIssue.confidenceState} />
                <ValidationChip state={topIssue.validationState} />
                {topIssue.required ? <Badge tone="neutral" className="px-2 py-0.5">Required</Badge> : null}
                {topIssue.material ? <Badge tone="neutral" className="px-2 py-0.5">Material</Badge> : null}
              </span>
              <span className="hidden h-4 w-px bg-border sm:inline" aria-hidden="true" />
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-muted-foreground">Status</span>
                <ProcessingStatusBadge status={item.processingStatus} />
                <ReviewStatusBadge status={item.reviewStatus} />
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end">
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

type QueueSummaryProps = Readonly<{
  items: ReviewQueueItem[];
  totalOpenIssues: number;
  totalDocuments: number;
}>;

function QueueSummary({ items, totalOpenIssues, totalDocuments }: QueueSummaryProps) {
  const next = items[0];
  if (!next) return null;
  const severity = issueSeverity(next);
  return (
    <section
      className="grid gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-center sm:gap-6"
      aria-label="Review queue summary"
    >
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open issues</div>
        <div className="text-xl font-semibold tabular-nums text-foreground">{totalOpenIssues}</div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Documents affected</div>
        <div className="text-xl font-semibold tabular-nums text-foreground">{totalDocuments}</div>
      </div>
      <div className="min-w-0 sm:border-l sm:border-border sm:pl-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Start with</div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="min-w-0 max-w-full truncate text-sm font-medium text-foreground"
            title={`${itemTitle(next)} · ${next.topIssue.label}`}
          >
            {itemTitle(next)} · {next.topIssue.label}
          </span>
          <Badge tone={severity === "blocking" ? "danger" : "warning"}>{issueSeverityLabel(severity)}</Badge>
          <span className="text-xs text-muted-foreground">{issueReason(next.topIssue)}</span>
        </div>
      </div>
    </section>
  );
}

function queueDescription(data: ReviewQueueResponse | undefined): string {
  if (!data) return "Ranking the most consequential unverified fields across your documents.";
  if (data.totalOpenIssues === 0) return "No open issues — every document is verified.";

  return "Ranked by approval blockers, confidence, and materiality.";
}

export function ReviewQueuePage() {
  const navigate = useNavigate();
  const queue = useReviewQueue();
  const items = queue.data?.items ?? [];
  const next = items[0];

  let content;
  if (queue.isLoading) {
    content = (
      <ul className="space-y-2" aria-busy="true" aria-label="Loading review queue">
        {Array.from({ length: 5 }).map((_, i) => (
          <QueueRowSkeleton key={i} index={i} />
        ))}
      </ul>
    );
  } else if (queue.isError) {
    content = (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6 text-sm">
          <p>Could not load the review queue. Your data is safe — please try again.</p>
          <Button variant="outline" size="sm" onClick={() => queue.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  } else if (items.length === 0) {
    content = (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" aria-hidden="true" />
          <p className="font-medium">You&apos;re all caught up</p>
          <p className="text-sm text-muted-foreground">
            No review work needs attention right now. New uploads with blockers or verification needs will appear here.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link to="/documents">Go to documents</Link>
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    content = (
      <ul className="space-y-2">
        {items.map((item) => (
          <QueueRow key={item.documentId} item={item} />
        ))}
      </ul>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <PageHeader
        icon={<ListChecks className="size-6" aria-hidden="true" />}
        title="Review queue"
        description={queueDescription(queue.data)}
        actions={
          next ? (
            <Button onClick={() => navigate(reviewHref(next))} className="shadow-sm shadow-primary/20 hover:shadow-md">
              Review next issue <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      {queue.data && queue.data.totalOpenIssues > 0 ? (
        <div className="space-y-2">
          <QueueSummary
            items={items}
            totalOpenIssues={queue.data.totalOpenIssues}
            totalDocuments={queue.data.totalDocuments}
          />
          {items.length < queue.data.totalDocuments ? (
            <p className="text-xs text-muted-foreground">Showing the top {items.length} documents by priority.</p>
          ) : null}
        </div>
      ) : null}

      {content}
    </div>
  );
}
