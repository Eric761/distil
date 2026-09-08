import { AlertTriangle, Info, RefreshCw } from "lucide-react";
import type { DocumentDetail } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useProcessDocument } from "@/features/documents/api";

type ProcessingPanelProps = Readonly<{
  detail: DocumentDetail;
}>;

export function ProcessingPanel({ detail }: ProcessingPanelProps) {
  const process = useProcessDocument(detail.summary.id);
  const status = detail.summary.processingStatus;
  const isUnsupported = detail.summary.failureCode === "UNSUPPORTED_FIXTURE";

  if (status === "queued" || status === "processing") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <Spinner />
          <div>
            <p className="font-medium">{detail.summary.processingPhase ?? "Processing…"}</p>
            <p className="text-sm text-muted-foreground">
              This runs in the background. You can leave this page and come back — we keep polling for you.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "failed") {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <div className="flex items-center gap-2">
            {isUnsupported ? (
              <Info className="size-5 text-primary" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
            )}
            <p className="font-medium">{isUnsupported ? "Unsupported document" : "Extraction failed"}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {detail.summary.failureMessage ?? "The extractor could not process this document."}
          </p>
          {detail.canRetry ? (
            <Button onClick={() => process.mutate(true)} disabled={process.isPending}>
              <RefreshCw className="size-4" aria-hidden="true" /> {process.isPending ? "Retrying…" : "Retry extraction"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              The uploaded file is safe. This document cannot be re-processed by the demo extractor.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // uploaded but not queued
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <p className="font-medium">Not processed yet</p>
        <p className="text-sm text-muted-foreground">This document has been uploaded but extraction has not started.</p>
        <Button onClick={() => process.mutate(false)} disabled={process.isPending}>
          {process.isPending ? "Starting…" : "Start extraction"}
        </Button>
      </CardContent>
    </Card>
  );
}
