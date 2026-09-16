import * as React from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Save,
} from "lucide-react";
import type { ExtractionDetail, ExtractionField, ReviewStatus } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { RecordTableEditor } from "./RecordTableEditor";
import { SchemaReviewControls } from "./SchemaReviewControls";
import { deriveFields, groupScalarSections, sectionLabel } from "./records";
import { projectField, useReviewDraft } from "./useReviewDraft";
import { useApprove, useSaveExtraction } from "./api";

type ViewMode = "attention" | "all" | "json";

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
  const [viewMode, setViewMode] = React.useState<ViewMode>("all");

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

  const derived = React.useMemo(() => deriveFields(detail.fields, detail.schema), [detail.fields, detail.schema]);
  const scalarSections = React.useMemo(
    () => groupScalarSections(derived.scalarFields, detail.schema),
    [derived.scalarFields, detail.schema],
  );
  const allFields: ExtractionField[] = detail.fields;

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
      { expectedExtractionId: detail.extractionId, expectedVersion: detail.version, changes: draft.toChanges() },
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
      { expectedExtractionId: detail.extractionId, expectedVersion: detail.version },
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
        <div className="flex items-center justify-between gap-3 p-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                isComplete ? "bg-success/10 text-success" : "bg-amber-100 text-amber-700",
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              ) : (
                <AlertCircle className="size-4" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Review progress</p>
              <p className="truncate text-sm font-semibold tabular-nums">
                {progressSummary}
                {openIssues.length > 0 ? (
                  <span className="font-normal text-muted-foreground"> · {openIssues.length} open</span>
                ) : (
                  <span className="font-normal text-success"> · All clear</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="subtle"
            disabled={!draft.dirty || save.isPending}
            onClick={handleSave}
          >
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

        <div className="border-t border-border px-3 pb-3 pt-2">
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1">
              <TabsTrigger
                value="attention"
                className="min-h-8 gap-2 px-2 text-xs font-medium sm:text-sm data-[state=active]:shadow-sm"
              >
                <span className="truncate">Needs attention</span>
                <Badge
                  tone={openIssues.length > 0 ? "warning" : "success"}
                  className="h-5 shrink-0 px-1.5 py-0 text-[10px] leading-5"
                >
                  {openIssues.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="min-h-8 gap-2 px-2 text-xs font-medium sm:text-sm data-[state=active]:shadow-sm"
              >
                <span className="truncate">All fields</span>
                <Badge tone="neutral" className="h-5 shrink-0 px-1.5 py-0 text-[10px] leading-5">
                  {allFields.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="json"
                className="min-h-8 px-2 text-xs font-medium sm:text-sm data-[state=active]:shadow-sm"
              >
                Raw JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {viewMode === "attention" && openIssues.length > 0 ? (
            <div className="mt-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5">
              <span className="px-1 text-xs font-medium text-amber-900 tabular-nums">
                Issue {(issueIndex % openIssues.length) + 1} of {openIssues.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-amber-900"
                  onClick={() => goToIssue(issueIndex - 1)}
                  aria-label="Previous issue"
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-amber-900"
                  onClick={() => goToIssue(issueIndex + 1)}
                  aria-label={`Next issue, ${(issueIndex % openIssues.length) + 1} of ${openIssues.length}`}
                >
                  Next <ArrowRight className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}
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

        {detail.statusNote && detail.status !== "succeeded" ? (
          <div className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {detail.statusNote}
          </div>
        ) : null}

        {viewMode === "json" ? (
          <section aria-labelledby="raw-json-title">
            <div className="mb-2">
              <h3 id="raw-json-title" className="text-sm font-semibold">Extraction JSON</h3>
              <p className="text-xs text-muted-foreground">Read-only structured output for this document.</p>
            </div>
            <pre className="overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs leading-relaxed">
              {JSON.stringify(detail.data ?? {}, null, 2)}
            </pre>
          </section>
        ) : viewMode === "attention" ? (
          openIssues.length === 0 ? (
            <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
              Nothing needs attention. Every field is high-confidence, valid, or already resolved.
            </p>
          ) : (
            <div className="space-y-2">{openIssues.map(renderField)}</div>
          )
        ) : (
          <div className="space-y-5">
            <SchemaReviewControls documentId={documentId} detail={detail} />

            {scalarSections.map(({ group, fields }) => (
              <section key={group} aria-labelledby={`section-${group}`}>
                <h3 id={`section-${group}`} className="mb-2 text-sm font-semibold text-foreground">
                  {sectionLabel(group)}
                </h3>
                <div className="space-y-2">{fields.map(renderField)}</div>
              </section>
            ))}

            {derived.records.map((group) => (
              <section key={group.key} aria-labelledby={`section-${group.key}`}>
                <h3 id={`section-${group.key}`} className="mb-2 text-sm font-semibold text-foreground">
                  {group.label}
                </h3>
                <RecordTableEditor group={group} renderField={renderField} />
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Approve confirmation */}
      <Dialog open={showApprove} onOpenChange={setShowApprove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this document?</DialogTitle>
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
