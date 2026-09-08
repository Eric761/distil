import * as React from "react";
import { Link } from "react-router-dom";
import { CircleAlert, Clock, FileClock, FileStack, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useReviewQueue } from "@/features/queue/api";

type Tone = "neutral" | "warning" | "info" | "success";

const TONE_STYLES: Record<Tone, { tile: string; value: string }> = {
  neutral: { tile: "bg-muted text-foreground", value: "text-foreground" },
  warning: { tile: "bg-warning/10 text-warning", value: "text-foreground" },
  info: { tile: "bg-primary/10 text-primary", value: "text-foreground" },
  success: { tile: "bg-success/10 text-success", value: "text-foreground" },
};

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone: Tone;
  to?: string;
}) {
  const styles = TONE_STYLES[tone];
  const body = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-all",
        to && "hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md",
      )}
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", styles.tile)} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className={cn("text-xl font-semibold leading-none tabular-nums", styles.value)}>{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{hint ?? label}</div>
      </div>
    </div>
  );
  return to ? (
    <Link to={to} aria-label={`${label}: ${String(value)}`} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * A compact "world at a glance" strip for the Documents landing page. Uses only
 * data we already fetch (documents total + active extraction) plus the review
 * queue aggregate, so it stays accurate across all pages without new endpoints.
 */
export function DocumentsSummary({
  total,
  activeProcessingCount,
  isFiltered = false,
}: {
  total: number;
  activeProcessingCount: number;
  isFiltered?: boolean;
}) {
  const queue = useReviewQueue();
  const needsReview = queue.data?.totalDocuments ?? null;
  const openIssues = queue.data?.totalOpenIssues ?? null;
  // "Clear" = documents that aren't waiting on a human right now.
  const clear = needsReview !== null ? Math.max(0, total - needsReview) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isFiltered ? "Filtered results" : "Workspace overview"}
        </p>
        {isFiltered ? (
          <p className="text-xs text-muted-foreground">Review KPIs show workspace totals</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<FileStack className="size-5" aria-hidden="true" />}
          label={isFiltered ? "Matching documents" : "Documents"}
          value={total.toLocaleString()}
          hint={isFiltered ? "Matching documents" : "Total documents"}
          tone="info"
        />
        <StatCard
          icon={<CircleAlert className="size-5" aria-hidden="true" />}
          label="Needs review"
          value={
            needsReview === null ? <Skeleton className="h-5 w-8" /> : needsReview.toLocaleString()
          }
          hint={
            openIssues && openIssues > 0
              ? `${isFiltered ? "Workspace: " : ""}${openIssues.toLocaleString()} open ${
                  openIssues === 1 ? "issue" : "issues"
                }`
              : `${isFiltered ? "Workspace: " : ""}Documents needing review`
          }
          tone="warning"
          to="/review-queue"
        />
        <StatCard
          icon={<ShieldCheck className="size-5" aria-hidden="true" />}
          label="Verified"
          value={clear === null ? <Skeleton className="h-5 w-8" /> : clear.toLocaleString()}
          hint={isFiltered ? "Workspace: no open issues" : "No open issues"}
          tone="success"
        />
        <StatCard
          icon={
            activeProcessingCount > 0 ? (
              <FileClock className="size-5 animate-pulse" aria-hidden="true" />
            ) : (
              <Clock className="size-5" aria-hidden="true" />
            )
          }
          label="Extraction"
          value={activeProcessingCount.toLocaleString()}
          hint={
            activeProcessingCount > 0
              ? `${isFiltered ? "Workspace: " : ""}Processing now`
              : `${isFiltered ? "Workspace: " : ""}No extraction running`
          }
          tone={activeProcessingCount > 0 ? "info" : "neutral"}
        />
      </div>
    </div>
  );
}

export function DocumentsSummarySkeleton({ isFiltered = false }: { isFiltered?: boolean }) {
  return (
    <div className="space-y-2" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isFiltered ? "Filtered results" : "Workspace overview"}
        </p>
        {isFiltered ? (
          <p className="text-xs text-muted-foreground">Review KPIs show workspace totals</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<FileStack className="size-5" aria-hidden="true" />}
          label={isFiltered ? "Matching documents" : "Documents"}
          value={<Skeleton className="h-5 w-10 bg-muted/80" />}
          hint={isFiltered ? "Matching documents" : "Total documents"}
          tone="info"
        />
        <StatCard
          icon={<CircleAlert className="size-5" aria-hidden="true" />}
          label="Needs review"
          value={<Skeleton className="h-5 w-10 bg-muted/80" />}
          hint={`${isFiltered ? "Workspace: " : ""}Documents needing review`}
          tone="warning"
        />
        <StatCard
          icon={<ShieldCheck className="size-5" aria-hidden="true" />}
          label="Verified"
          value={<Skeleton className="h-5 w-10 bg-muted/80" />}
          hint={isFiltered ? "Workspace: no open issues" : "No open issues"}
          tone="success"
        />
        <StatCard
          icon={<Clock className="size-5" aria-hidden="true" />}
          label="Extraction"
          value={<Skeleton className="h-5 w-10 bg-muted/80" />}
          hint={`${isFiltered ? "Workspace: " : ""}Checking extraction work`}
          tone="neutral"
        />
      </div>
    </div>
  );
}
