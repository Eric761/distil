import { FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

function FieldCardSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className={wide ? "h-4 w-40 bg-muted/80" : "h-4 w-28 bg-muted/80"} />
          <Skeleton className="h-4 w-32 bg-muted/80" />
          <Skeleton className="h-3 w-24 bg-muted/80" />
        </div>
        <Skeleton className="h-5 w-24 rounded-full bg-muted/80" />
      </div>
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-7 w-20 bg-muted/80" />
        <Skeleton className="h-7 w-24 bg-muted/80" />
      </div>
    </div>
  );
}

export function DocumentPreviewLoading() {
  return (
    <div className="flex min-h-full items-start justify-center p-6">
      <div className="w-full max-w-[34rem] space-y-4">
        <div className="rounded-md border border-border bg-background p-8 shadow-sm">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48 bg-muted/80" />
              <Skeleton className="h-3 w-32 bg-muted/80" />
              <Skeleton className="h-3 w-40 bg-muted/80" />
            </div>
            <Skeleton className="h-7 w-28 bg-muted/80" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-full bg-muted/80" />
            ))}
          </div>
          <div className="mt-10 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_4rem_5rem_5rem] gap-3">
                <Skeleton className="h-3 bg-muted/80" />
                <Skeleton className="h-3 bg-muted/80" />
                <Skeleton className="h-3 bg-muted/80" />
                <Skeleton className="h-3 bg-muted/80" />
              </div>
            ))}
          </div>
          <div className="mt-8 ml-auto w-40 space-y-2">
            <Skeleton className="h-3 w-full bg-muted/80" />
            <Skeleton className="h-4 w-full bg-muted/80" />
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">Loading document preview…</p>
      </div>
    </div>
  );
}

export function ReviewWorkspaceLoading() {
  return (
    <div
      className="flex min-h-[70vh] flex-col overflow-hidden rounded-lg border border-border bg-card lg:h-[calc(100vh-11rem)] lg:flex-row"
      aria-busy="true"
    >
      <div className="min-h-0 flex-1 border-border lg:flex-[1.2] lg:border-r">
        <div className="flex items-center justify-between gap-2 border-b border-border p-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 bg-muted/80" />
            <Skeleton className="h-4 w-20 bg-muted/80" />
            <Skeleton className="h-8 w-16 bg-muted/80" />
          </div>
          <Skeleton className="h-8 w-28 bg-muted/80" />
        </div>
        <div className="h-full bg-muted/30">
          <DocumentPreviewLoading />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <div className="flex items-center justify-between gap-2 border-b border-border p-2">
          <Skeleton className="h-4 w-28 bg-muted/80" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 bg-muted/80" />
            <Skeleton className="h-8 w-24 bg-muted/80" />
            <Skeleton className="h-8 w-20 bg-muted/80" />
          </div>
        </div>
        <div className="space-y-3 p-3">
          <Skeleton className="h-4 w-24 bg-muted/80" />
          <FieldCardSkeleton wide />
          <FieldCardSkeleton />
          <FieldCardSkeleton />
          <Skeleton className="mt-5 h-4 w-32 bg-muted/80" />
          <FieldCardSkeleton wide />
        </div>
      </div>
    </div>
  );
}

export function ReviewPageLoading() {
  return (
    <>
      <PageHeader
        icon={<FileText className="size-6" aria-hidden="true" />}
        title={<Skeleton className="h-7 w-72 bg-muted/80" />}
        description={<Skeleton className="h-4 w-56 bg-muted/80" />}
        actions={
          <>
            <Skeleton className="h-6 w-24 rounded-full bg-muted/80" />
            <Skeleton className="h-6 w-28 rounded-full bg-muted/80" />
          </>
        }
      />
      <ReviewWorkspaceLoading />
    </>
  );
}
