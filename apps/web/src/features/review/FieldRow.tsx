import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, MapPin, Pencil, RotateCcw, Undo2 } from "lucide-react";
import type { ExtractionField } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfidenceChip, ValidationChip, reviewStateLabel } from "@/components/status-indicators";
import { useProvenance } from "@/features/provenance/provenance-context";
import type { DraftEntry } from "./useReviewDraft";
import { projectField } from "./useReviewDraft";

function valueSchema(field: ExtractionField): z.ZodType<string> {
  switch (field.type) {
    case "decimal":
      return z.string().regex(/^-?\d+(\.\d+)?$/u, "Enter a valid number.");
    case "date":
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Use YYYY-MM-DD.");
    case "currency":
      return z.string().regex(/^[A-Z]{3}$/u, "Use a 3-letter code, e.g. USD.");
    default:
      return z.string().min(1, "Enter a value.");
  }
}

interface Props {
  field: ExtractionField;
  entry: DraftEntry | undefined;
  onConfirm: () => void;
  onCorrect: (value: string) => void;
  onNotApplicable: () => void;
  onResolveConflict: (candidateId: string, value: string) => void;
  onRevert: () => void;
}

export const FieldRow = React.forwardRef<HTMLDivElement, Props>(function FieldRow(
  { field, entry, onConfirm, onCorrect, onNotApplicable, onResolveConflict, onRevert },
  ref,
) {
  const [editing, setEditing] = React.useState(false);
  const projected = projectField(field, entry);
  const { focus } = useProvenance();

  const primarySource = field.sourceReferences[0] ?? null;
  const needsAttention = !projected.resolvedLocally;
  const conflictCandidates = React.useMemo(() => {
    const seen = new Set<string>();
    return field.conflictCandidates.filter((cand) => {
      const key = `${cand.label}:${cand.value === null ? "" : String(cand.value)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [field.conflictCandidates]);

  const showSource = () => {
    if (!primarySource) return;
    focus({
      fieldId: field.id,
      page: primarySource.page,
      box: primarySource.box,
      text: primarySource.sourceText,
      label: field.label,
    });
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-field-id={field.id}
      className={`min-w-0 rounded-md border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        needsAttention ? "border-amber-300 bg-amber-50/50" : "border-border bg-background"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="break-words text-sm font-medium">{field.label}</span>
          {field.required ? <span className="text-xs text-muted-foreground">(required)</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ConfidenceChip state={field.confidenceState} score={field.confidenceScore} />
          <ValidationChip state={field.validationState} message={field.validationIssues[0]?.message} />
        </div>
      </div>

      {field.confidenceReason ? (
        <p className="mt-1 text-xs text-muted-foreground">{field.confidenceReason}</p>
      ) : null}

      {editing ? (
        <InlineEditor
          field={field}
          initialValue={projected.displayValue}
          onCancel={() => setEditing(false)}
          onSubmit={(value) => {
            onCorrect(value);
            setEditing(false);
          }}
        />
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm">
              {projected.reviewLabel === "not_applicable" ? (
                <span className="italic text-muted-foreground">Marked not applicable</span>
              ) : projected.displayValue ? (
                <span className="break-words font-medium tabular-nums">{projected.displayValue}</span>
              ) : (
                <span className="italic text-muted-foreground">No value extracted</span>
              )}
            </p>
            {projected.isCorrected && field.extractedValue !== null && field.extractedValue !== undefined ? (
              <p className="text-xs text-muted-foreground">
                Originally extracted as “{String(field.extractedValue)}”
              </p>
            ) : null}
            <p className="mt-0.5 text-xs text-muted-foreground">Status: {reviewStateLabel(projected.reviewLabel)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {primarySource ? (
              <Button variant="ghost" size="sm" onClick={showSource}>
                <MapPin className="size-4" aria-hidden="true" /> View source
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">No source region</span>
            )}
          </div>
        </div>
      )}

      {/* Conflict candidates */}
      {conflictCandidates.length > 0 && !editing ? (
        <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2">
          <p className="text-xs font-medium text-muted-foreground">Choose the correct value:</p>
          <div className="flex flex-wrap gap-2">
            {conflictCandidates.map((cand) => {
              const selected = entry?.action === "resolve_conflict" && entry.candidateId === cand.id;
              return (
                <Button
                  key={cand.id}
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  onClick={() => onResolveConflict(cand.id, cand.value === null ? "" : String(cand.value))}
                  onMouseEnter={() => {
                    const ref = field.sourceReferences.find((r) => r.id === cand.sourceReferenceId);
                    if (ref) focus({ fieldId: field.id, page: ref.page, box: ref.box, text: ref.sourceText, label: field.label });
                  }}
                >
                  {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                  {cand.label}: {cand.value === null ? "—" : String(cand.value)}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!editing ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {needsAttention && field.confidenceState !== "conflicting" && field.effectiveValue !== null ? (
            <Button variant="subtle" size="sm" onClick={onConfirm}>
              <Check className="size-4" aria-hidden="true" /> Confirm
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden="true" /> Correct
          </Button>
          {!field.required ? (
            <Button variant="ghost" size="sm" onClick={onNotApplicable}>
              <RotateCcw className="size-4" aria-hidden="true" /> Not applicable
            </Button>
          ) : null}
          {entry ? (
            <Button variant="ghost" size="sm" onClick={onRevert}>
              <Undo2 className="size-4" aria-hidden="true" /> Undo
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

function InlineEditor({
  field,
  initialValue,
  onSubmit,
  onCancel,
}: {
  field: ExtractionField;
  initialValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const schema = React.useMemo(() => z.object({ value: valueSchema(field) }), [field]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ value: string }>({
    resolver: zodResolver(schema),
    defaultValues: { value: initialValue },
  });
  const errId = `${field.id}-error`;

  return (
    <form
      className="mt-2 min-w-0 space-y-2"
      onSubmit={handleSubmit((data) => onSubmit(data.value))}
    >
      <label htmlFor={`${field.id}-input`} className="sr-only">
        {field.label}
      </label>
      <Input
        id={`${field.id}-input`}
        autoFocus
        aria-invalid={Boolean(errors.value)}
        aria-describedby={errors.value ? errId : undefined}
        placeholder={field.type === "date" ? "YYYY-MM-DD" : field.type === "currency" ? "USD" : undefined}
        {...register("value")}
      />
      {errors.value ? (
        <p id={errId} className="text-xs text-destructive">
          {errors.value.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save value
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
