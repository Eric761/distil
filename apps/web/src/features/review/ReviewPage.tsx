import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProcessingStatusBadge, ReviewStatusBadge } from "@/components/status-indicators";
import { ApiError } from "@/lib/api-client";
import { useDocumentDetail } from "@/features/documents/api";
import { useExtraction } from "./api";
import { ProcessingPanel } from "./ProcessingPanel";
import { ReviewPageLoading, ReviewWorkspaceLoading } from "./ReviewLoadingState";
import { SplitWorkspace } from "./SplitWorkspace";

export function ReviewPage() {
  const { documentId = "" } = useParams();
  const [sp] = useSearchParams();
  const location = useLocation();
  const from = sp.get("from");
  // "query" is the legacy value; "explore" is current. Treat both the same.
  const fromExplore = from === "explore" || from === "query";
  const fromQueue = from === "queue";
  const focusField = sp.get("focusField") ?? undefined;

  const detail = useDocumentDetail(documentId, { poll: true });
  const hasExtraction = detail.data?.hasExtraction ?? false;
  const extraction = useExtraction(documentId, hasExtraction);
  const currentExtractionId = detail.data?.currentExtractionId ?? null;
  const cachedExtractionId = extraction.data?.extractionId ?? null;

  useEffect(() => {
    if (!currentExtractionId || !cachedExtractionId) return;
    if (cachedExtractionId === currentExtractionId) return;
    if (extraction.isFetching) return;
    void extraction.refetch();
  }, [cachedExtractionId, currentExtractionId, extraction.isFetching, extraction.refetch]);

  const querySearch = (location.state as { querySearch?: string } | null)?.querySearch ?? "";
  const backLink = fromExplore ? `/explore${querySearch}` : fromQueue ? "/review-queue" : "/documents";
  const backLabel = fromExplore ? "Back to explore" : fromQueue ? "Back to review queue" : "Back to documents";

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3 sm:p-4">
      {detail.isLoading ? (
        <ReviewPageLoading />
      ) : detail.isError ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6 text-sm">
            <span>
              {(detail.error as ApiError)?.status === 404
                ? "This document could not be found."
                : "Could not load this document. Your data is safe — please try again."}
            </span>
            {(detail.error as ApiError)?.status !== 404 ? (
              <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
                Retry
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : detail.data ? (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button asChild variant="ghost" size="icon" className="size-8 shrink-0" aria-label={backLabel}>
                <Link to={backLink}>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                {detail.data.summary.originalFilename}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <ProcessingStatusBadge
                  status={detail.data.summary.processingStatus}
                  phase={detail.data.summary.processingPhase}
                />
                <ReviewStatusBadge status={detail.data.summary.reviewStatus} />
            </div>
          </header>

          {!hasExtraction ? (
            <ProcessingPanel detail={detail.data} />
          ) : extraction.isLoading ? (
            <ReviewWorkspaceLoading />
          ) : extraction.isError ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-6 text-sm">
                <span>Could not load the extraction. Your data is safe — please retry.</span>
                <Button variant="outline" size="sm" onClick={() => void extraction.refetch()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : extraction.data ? (
            <SplitWorkspace
              documentId={documentId}
              detail={extraction.data}
              reviewStatus={detail.data.summary.reviewStatus}
              focusFieldPath={focusField}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
