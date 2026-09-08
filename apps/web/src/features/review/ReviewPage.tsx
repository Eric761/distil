import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProcessingStatusBadge, ReviewStatusBadge } from "@/components/status-indicators";
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/utils";
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
  const fromQuery = from === "query";
  const fromQueue = from === "queue";
  const focusField = sp.get("focusField") ?? undefined;

  const detail = useDocumentDetail(documentId, { poll: true });
  const hasExtraction = detail.data?.hasExtraction ?? false;
  const extraction = useExtraction(documentId, hasExtraction);

  const querySearch = (location.state as { querySearch?: string } | null)?.querySearch ?? "";
  const backLink = fromQuery ? `/query${querySearch}` : fromQueue ? "/review-queue" : "/documents";
  const backLabel = fromQuery ? "Back to query" : fromQueue ? "Back to review queue" : "Back to documents";

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={backLink}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {backLabel}
          </Link>
        </Button>
      </div>

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
          <PageHeader
            title={detail.data.summary.originalFilename}
            description={
              <>
                {detail.data.summary.vendorName ?? "Vendor pending"} ·{" "}
                <span className="tabular-nums">
                  {formatMoney(detail.data.summary.total, detail.data.summary.currency)}
                </span>
              </>
            }
            actions={
              <>
                <ProcessingStatusBadge
                  status={detail.data.summary.processingStatus}
                  phase={detail.data.summary.processingPhase}
                />
                <ReviewStatusBadge status={detail.data.summary.reviewStatus} />
              </>
            }
          />

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
