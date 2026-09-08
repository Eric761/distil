import * as React from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Save } from "lucide-react";
import type { ExtractionDetail, ExtractionField, ReviewStatus } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAnnouncer } from "@/components/live-region";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { FieldRow } from "./FieldRow";
import { LineItemsEditor } from "./LineItemsEditor";
import { projectField, useReviewDraft } from "./useReviewDraft";
import { useApprove, useSaveExtraction } from "./api";

const GROUP_LABELS: Record<string, string> = {
  identity: "Identity",
  dates: "Dates and terms",
  amounts: "Amounts",
  metadata: "Metadata",
};

export function ReviewForm({
  documentId,
  detail,
  reviewStatus,
}: {
  documentId: string;
  detail: ExtractionDetail;
  reviewStatus: ReviewStatus;
}) {
  const draft = useReviewDraft();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const save = useSaveExtraction(documentId);
  const approve = useApprove(documentId);
  const qc = useQueryClient();
  const { announce } = useAnnouncer();
  const [issueIndex, setIssueIndex] = React.useState(0);
  const [showApprove, setShowApprove] = React.useState(false);
  const [staleConflict, setStaleConflict] = React.useState(false);

  // Warn before leaving with unsaved changes: browser unload (tab close/reload)…
  React.useEffect(() => {
    if (!draft.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft.dirty]);

  // …and in-app SPA navigation (back link, nav bar) via the router blocker.
  const shouldBlock = React.useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      draft.dirty && currentLocation.pathname !== nextLocation.pathname,
    [draft.dirty],
  );
  const blocker = useBlocker(shouldBlock);

  const lineItemFields = detail.lineItems.flatMap((li) => [
    li.fields.description,
    li.fields.quantity,
    li.fields.unitPrice,
    li.fields.lineTotal,
  ]);
  const allFields: ExtractionField[] = [...detail.fields, ...lineItemFields];

  const openIssues = allFields.filter((f) => !projectField(f, draft.draft[f.id]).resolvedLocally);

  const focusField = (fieldId: string) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-field-id="${fieldId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  };

  const goToIssue = (index: number) => {
    if (openIssues.length === 0) return;
    const clamped = (index + openIssues.length) % openIssues.length;
    setIssueIndex(clamped);
    const target = openIssues[clamped];
    if (target) focusField(target.id);
  };

  const renderField = (field: ExtractionField): React.ReactNode => (
    <FieldRow
      key={field.id}
      field={field}
      entry={draft.draft[field.id]}
      onConfirm={() => draft.confirm(field.id)}
      onCorrect={(value) => draft.correct(field.id, value)}
      onNotApplicable={() => draft.markNotApplicable(field.id)}
      onResolveConflict={(candidateId, value) => draft.resolveConflict(field.id, candidateId, value)}
      onRevert={() => draft.revert(field.id)}
    />
  );

  const handleSave = () => {
    if (!draft.dirty) return;
    save.mutate(
      { expectedVersion: detail.version, changes: draft.toChanges() },
      {
        onSuccess: (updated) => {
          draft.reset();
          announce(
            updated.approvalBlockers.length === 0
              ? "Changes saved. This document is ready to approve."
              : `Changes saved. ${updated.approvalBlockers.length} item(s) still need attention.`,
          );
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === "STALE_EXTRACTION_VERSION") {
            setStaleConflict(true);
          }
        },
      },
    );
  };

  const reloadLatest = () => {
    draft.reset();
    setStaleConflict(false);
    void qc.invalidateQueries({ queryKey: queryKeys.documents.extraction(documentId) });
  };

  const handleApprove = () => {
    approve.mutate(
      { expectedVersion: detail.version },
      {
        onSuccess: () => {
          setShowApprove(false);
          announce("Document approved. It is now part of your queryable records.");
        },
        onError: (error) => {
          setShowApprove(false);
          if (error instanceof ApiError && error.code === "APPROVAL_BLOCKED") {
            const first = error.problem.fieldErrors?.[0];
            if (first) {
              const target = allFields.find((f) => f.path === first.path);
              if (target) focusField(target.id);
            }
          }
        },
      },
    );
  };

  const grouped = (["identity", "dates", "amounts", "metadata"] as const).map((group) => ({
    group,
    fields: detail.fields.filter((f) => f.group === group),
  }));

  const correctionCount = Object.values(draft.draft).filter(
    (e) => e.action === "correct" || e.action === "resolve_conflict",
  ).length;
  const serverBlockers = detail.approvalBlockers;
  const canApprove = !draft.dirty && serverBlockers.length === 0 && reviewStatus !== "approved";
  const isApproved = reviewStatus === "approved";

  const totalAttention = detail.progress.totalAttentionFields;
  const resolvedAttention = detail.progress.resolvedAttentionFields;
  const progressPct = totalAttention > 0 ? Math.round((resolvedAttention / totalAttention) * 100) : 100;
  const isComplete = openIssues.length === 0;
  const progressSummary =
    totalAttention === 0
      ? "No review needed"
      : `${resolvedAttention}/${totalAttention} resolved`;

  return (
    <div className="flex h-full flex-col">
      {/* Sticky progress + actions header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium tabular-nums">{progressSummary}</span>
          {openIssues.length > 0 ? (
            <span className="text-muted-foreground">· {openIssues.length} open now</span>
          ) : isComplete ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" /> All clear
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={openIssues.length === 0}
            onClick={() => goToIssue(issueIndex - 1)}
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={openIssues.length === 0}
            onClick={() => goToIssue(issueIndex + 1)}
            aria-label={openIssues.length ? `Next issue, ${(issueIndex % openIssues.length) + 1} of ${openIssues.length}` : "Next issue"}
          >
            Next issue <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          <Button size="sm" variant="subtle" disabled={!draft.dirty || save.isPending} onClick={handleSave}>
            <Save className="size-4" aria-hidden="true" /> {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" disabled={!canApprove || approve.isPending} onClick={() => setShowApprove(true)}>
            Approve
          </Button>
        </div>
        </div>
        {/* Slim progress track: how much of the attention work is resolved. */}
        <div
          className="h-1 w-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-label="Review progress"
        >
          <div
            className={cn("h-full transition-all duration-500", isComplete ? "bg-success" : "bg-primary")}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto p-3">
        {isApproved ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            This document is approved and part of your queryable records. Editing a field will reopen approval.
          </div>
        ) : null}

        {draft.dirty ? (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" role="status">
            You have unsaved changes.{" "}
            {isApproved ? "Saving will reopen this approved record for re-approval." : "Save to update validation and enable approval."}
          </div>
        ) : null}

        {save.isError && !staleConflict ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4" aria-hidden="true" />
            <span>
              {(save.error as ApiError)?.problem?.detail ?? "Save failed."} Your edits are kept locally — try saving again.
            </span>
          </div>
        ) : null}

        {!draft.dirty && serverBlockers.length > 0 ? (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Resolve before approving:</p>
            <ul className="mt-1 list-disc pl-5">
              {serverBlockers.map((b, i) => (
                <li key={i}>
                  <button className="underline" onClick={() => b.fieldId && focusField(b.fieldId)}>
                    {b.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-5">
          {grouped.map(({ group, fields }) =>
            fields.length === 0 ? null : (
              <section key={group} aria-labelledby={`section-${group}`}>
                <h3 id={`section-${group}`} className="mb-2 text-sm font-semibold text-foreground">
                  {GROUP_LABELS[group]}
                </h3>
                <div className="space-y-2">{fields.map(renderField)}</div>
              </section>
            ),
          )}

          <section aria-labelledby="section-lineItems">
            <h3 id="section-lineItems" className="mb-2 text-sm font-semibold text-foreground">
              Line items
            </h3>
            <LineItemsEditor lineItems={detail.lineItems} renderField={renderField} />
          </section>
        </div>
      </div>

      {/* Approve confirmation */}
      <Dialog open={showApprove} onOpenChange={setShowApprove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this invoice?</DialogTitle>
            <DialogDescription>
              Approving promotes this record to your trusted, queryable data. High-confidence fields are
              accepted automatically; {correctionCount} field(s) were explicitly corrected.
            </DialogDescription>
          </DialogHeader>
          {approve.isError ? (
            <p className="text-sm text-destructive">
              {(approve.error as ApiError)?.problem?.detail ?? "Approval failed."}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowApprove(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={approve.isPending}>
              {approve.isPending ? "Approving…" : "Approve record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved-changes navigation guard (in-app links / nav bar) */}
      <Dialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>
              You have unsaved changes on this document. If you leave now, your edits will be
              discarded. They have not been saved to the server yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => blocker.state === "blocked" && blocker.reset()}>
              Stay on this page
            </Button>
            <Button
              variant="destructive"
              onClick={() => blocker.state === "blocked" && blocker.proceed()}
            >
              Leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stale-version conflict */}
      <Dialog open={staleConflict} onOpenChange={setStaleConflict}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This document changed</DialogTitle>
            <DialogDescription>
              Someone (or another tab) updated this extraction since you loaded it. Your local edits are
              still here. Reload the latest version to continue — your unsaved edits will be cleared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStaleConflict(false)}>
              Keep editing
            </Button>
            <Button onClick={reloadLatest}>Reload latest</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
