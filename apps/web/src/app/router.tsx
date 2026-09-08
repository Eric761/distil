import * as React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { ListChecks } from "lucide-react";
import { AppLayout } from "./AppLayout";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { QueryRouteLoading } from "@/features/query/QueryLoadingState";
import { ReviewPageLoading } from "@/features/review/ReviewLoadingState";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteError } from "./RouteError";

const ReviewPage = React.lazy(() =>
  import("@/features/review/ReviewPage").then((m) => ({ default: m.ReviewPage })),
);
const QueryPage = React.lazy(() =>
  import("@/features/query/QueryPage").then((m) => ({ default: m.QueryPage })),
);
const ReviewQueuePage = React.lazy(() =>
  import("@/features/queue/ReviewQueuePage").then((m) => ({ default: m.ReviewQueuePage })),
);

function QueueCardSkeleton({ index }: { index: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border border-l-4 border-l-muted bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
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
      </div>
    </div>
  );
}

function ReviewQueueRouteFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6" aria-busy="true">
      <PageHeader
        icon={<ListChecks className="size-6" aria-hidden="true" />}
        title="Review queue"
        description="Ranking the most consequential unverified fields across your documents."
        actions={<Skeleton className="h-9 w-40" />}
      />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <QueueCardSkeleton key={i} index={i} />
        ))}
      </div>
    </div>
  );
}

function ReviewRouteLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <ReviewPageLoading />
    </div>
  );
}

function Lazy({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  return <React.Suspense fallback={fallback}>{children}</React.Suspense>;
}

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/documents" replace /> },
      { path: "documents", element: <DocumentsPage /> },
      {
        path: "review-queue",
        element: (
          <Lazy fallback={<ReviewQueueRouteFallback />}>
            <ReviewQueuePage />
          </Lazy>
        ),
      },
      {
        path: "documents/:documentId/review",
        element: (
          <Lazy fallback={<ReviewRouteLoading />}>
            <ReviewPage />
          </Lazy>
        ),
      },
      {
        path: "query",
        element: (
          <Lazy fallback={<QueryRouteLoading />}>
            <QueryPage />
          </Lazy>
        ),
      },
    ],
  },
]);
