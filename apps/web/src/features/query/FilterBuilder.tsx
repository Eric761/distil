import * as React from "react";
import type {
  AmountComparator,
  DocumentType,
  ProcessingStatus,
  QueryFilters,
  ReviewStatus,
} from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProcessingStatusIcon, ReviewStatusIcon } from "@/components/status-indicators";

/** Radix Select reserves "" for the empty/placeholder state, so use a sentinel for "Any". */
const ANY = "__any";

type FilterBuilderProps = Readonly<{
  value: QueryFilters;
  onApply: (filters: QueryFilters) => void;
  onClear: () => void;
}>;

/** Editable, inspectable filters — the source of truth for a query. */
export function FilterBuilder({
  value,
  onApply,
  onClear,
}: FilterBuilderProps) {
  const [draft, setDraft] = React.useState<QueryFilters>(value);
  React.useEffect(() => setDraft(value), [value]);

  const amount = draft.amount;

  const set = (patch: Partial<QueryFilters>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="f-vendor">Vendor contains</Label>
        <Input
          id="f-vendor"
          value={draft.vendor ?? ""}
          onChange={(e) => set({ vendor: e.target.value || undefined })}
          placeholder="e.g. Acme"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-currency">Currency</Label>
        <Select
          value={draft.currency ?? ANY}
          onValueChange={(v) => set({ currency: v === ANY ? undefined : v })}
        >
          <SelectTrigger id="f-currency" aria-label="Currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="GBP">GBP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-amount-cmp">Total</Label>
        <div className="flex gap-2">
          <Select
            value={amount?.comparator ?? ANY}
            onValueChange={(v) => {
              if (v === ANY) return set({ amount: undefined });
              const cmp = v as AmountComparator;
              set({ amount: { comparator: cmp, value: amount?.value ?? "0", valueTo: amount?.valueTo } });
            }}
          >
            <SelectTrigger id="f-amount-cmp" aria-label="Total comparator" className="w-40 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any</SelectItem>
              <SelectItem value="gt">greater than</SelectItem>
              <SelectItem value="gte">at least</SelectItem>
              <SelectItem value="lt">less than</SelectItem>
              <SelectItem value="lte">at most</SelectItem>
              <SelectItem value="between">between</SelectItem>
            </SelectContent>
          </Select>
          {amount ? (
            <Input
              aria-label="Amount value"
              inputMode="decimal"
              value={amount.value}
              onChange={(e) => set({ amount: { ...amount, value: e.target.value } })}
              className="w-28"
            />
          ) : null}
          {amount?.comparator === "between" ? (
            <Input
              aria-label="Amount upper bound"
              inputMode="decimal"
              value={amount.valueTo ?? ""}
              onChange={(e) => set({ amount: { ...amount, valueTo: e.target.value } })}
              className="w-28"
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-status">Review status</Label>
        <Select
          value={draft.reviewStatus?.[0] ?? ANY}
          onValueChange={(v) =>
            set({ reviewStatus: v === ANY ? undefined : [v as ReviewStatus] })
          }
        >
          <SelectTrigger id="f-status" aria-label="Review status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Approved (default)</SelectItem>
            <SelectItem value="needs_review">
              <ReviewStatusIcon status="needs_review" /> Needs review
            </SelectItem>
            <SelectItem value="ready">
              <ReviewStatusIcon status="ready" /> Ready
            </SelectItem>
            <SelectItem value="reopened">
              <ReviewStatusIcon status="reopened" /> Reopened
            </SelectItem>
            <SelectItem value="approved">
              <ReviewStatusIcon status="approved" /> Approved
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-date-from">Invoice date from</Label>
        <Input
          id="f-date-from"
          type="date"
          value={draft.invoiceDate?.from ?? ""}
          onChange={(e) => set({ invoiceDate: { ...draft.invoiceDate, from: e.target.value || undefined } })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-date-to">Invoice date to</Label>
        <Input
          id="f-date-to"
          type="date"
          value={draft.invoiceDate?.to ?? ""}
          onChange={(e) => set({ invoiceDate: { ...draft.invoiceDate, to: e.target.value || undefined } })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-due-from">Due date from</Label>
        <Input
          id="f-due-from"
          type="date"
          value={draft.dueDate?.from ?? ""}
          onChange={(e) => set({ dueDate: { ...draft.dueDate, from: e.target.value || undefined } })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-due-to">Due date to</Label>
        <Input
          id="f-due-to"
          type="date"
          value={draft.dueDate?.to ?? ""}
          onChange={(e) => set({ dueDate: { ...draft.dueDate, to: e.target.value || undefined } })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-processing">Extraction status</Label>
        <Select
          value={draft.processingStatus?.[0] ?? ANY}
          onValueChange={(v) =>
            set({ processingStatus: v === ANY ? undefined : [v as ProcessingStatus] })
          }
        >
          <SelectTrigger id="f-processing" aria-label="Extraction status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            <SelectItem value="succeeded">
              <ProcessingStatusIcon status="succeeded" /> Extracted
            </SelectItem>
            <SelectItem value="partial">
              <ProcessingStatusIcon status="partial" /> Partial
            </SelectItem>
            <SelectItem value="failed">
              <ProcessingStatusIcon status="failed" /> Failed
            </SelectItem>
            <SelectItem value="processing">
              <ProcessingStatusIcon status="processing" /> Processing
            </SelectItem>
            <SelectItem value="queued">
              <ProcessingStatusIcon status="queued" /> Queued
            </SelectItem>
            <SelectItem value="uploaded">
              <ProcessingStatusIcon status="uploaded" /> Uploaded
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-doctype">Document type</Label>
        <Select
          value={draft.documentType ?? ANY}
          onValueChange={(v) => set({ documentType: v === ANY ? undefined : (v as DocumentType) })}
        >
          <SelectTrigger id="f-doctype" aria-label="Document type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" size="sm">Apply filters</Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft({});
            onClear();
          }}
        >
          Clear all
        </Button>
      </div>
    </form>
  );
}
