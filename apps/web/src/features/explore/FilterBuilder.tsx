import * as React from "react";
import type {
  AmountComparator,
  DocumentType,
  FieldFilter,
  ProcessingStatus,
  QueryFilters,
  ReviewStatus,
  SchemaFieldDef,
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
import { useSchemas, useSchemaVersion } from "@/features/schemas/api";

/** Radix Select reserves "" for the empty/placeholder state, so use a sentinel for "Any". */
const ANY = "__any";

type FilterBuilderProps = Readonly<{
  value: QueryFilters;
  onApply: (filters: QueryFilters) => void;
  onClear: () => void;
}>;

interface FieldOption {
  key: string;
  label: string;
  type: SchemaFieldDef["type"];
}

function flattenFieldOptions(fields: SchemaFieldDef[], prefix = ""): FieldOption[] {
  const options: FieldOption[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    if (field.nodeKind === "scalar") {
      options.push({ key: path, label: field.label, type: field.type });
    }
    if (field.nodeKind === "object") {
      options.push(...flattenFieldOptions(field.children ?? [], path));
    }
    if (field.nodeKind === "array") {
      for (const child of field.item?.children ?? []) {
        if (child.nodeKind === "scalar") {
          options.push({ key: `${field.key}[].${child.key}`, label: `${field.label} · ${child.label}`, type: child.type });
        }
      }
    }
  }
  return options;
}

function updateFieldFilter(filters: FieldFilter[] | undefined, index: number, patch: Partial<FieldFilter>): FieldFilter[] {
  return (filters ?? []).map((filter, i) => (i === index ? { ...filter, ...patch } : filter));
}

/** Editable, inspectable filters — the source of truth for a query. */
export function FilterBuilder({
  value,
  onApply,
  onClear,
}: FilterBuilderProps) {
  const [draft, setDraft] = React.useState<QueryFilters>(value);
  React.useEffect(() => setDraft(value), [value]);
  const schemas = useSchemas();
  const selectedFamily = schemas.data?.families.find((family) => family.key === draft.schemaKey) ?? null;
  const selectedVersionId =
    selectedFamily?.versions.find((version) => version.status === "published")?.versionId ??
    selectedFamily?.versions[0]?.versionId ??
    null;
  const schemaVersion = useSchemaVersion(selectedVersionId);
  const fieldOptions = React.useMemo(
    () => flattenFieldOptions(schemaVersion.data?.fields ?? []),
    [schemaVersion.data?.fields],
  );

  const amount = draft.amount;

  const set = (patch: Partial<QueryFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const addFieldFilter = () => {
    const first = fieldOptions[0];
    if (!first) return;
    set({ fields: [...(draft.fields ?? []), { path: first.key, op: "contains", value: "" }] });
  };
  const submitFilters = () => {
    const fields = (draft.fields ?? [])
      .filter((filter) => filter.op === "exists" || (filter.value?.trim().length ?? 0) > 0)
      .map((filter) => filter.op === "exists" ? { path: filter.path, op: filter.op } : { ...filter, value: filter.value?.trim() });
    onApply({ ...draft, fields: fields.length > 0 ? fields : undefined });
  };

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        submitFilters();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="f-search">Search text</Label>
        <Input
          id="f-search"
          value={draft.search ?? ""}
          onChange={(e) => set({ search: e.target.value || undefined })}
          placeholder="e.g. Orbital Cloud Migration"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="f-schema">Schema</Label>
        <Select
          value={draft.schemaKey ?? ANY}
          onValueChange={(v) =>
            set({
              schemaKey: v === ANY ? undefined : v,
              fields: undefined,
            })
          }
        >
          <SelectTrigger id="f-schema" aria-label="Schema">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any schema</SelectItem>
            {(schemas.data?.families ?? []).map((family) => (
              <SelectItem key={family.key} value={family.key}>
                {family.name} ({family.documentCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
            <SelectItem value={ANY}>Use trust-scope default</SelectItem>
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
            <SelectItem value="document">Generic document</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3 sm:col-span-2 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-foreground">Schema fields</p>
            <p className="text-xs text-muted-foreground">
              Choose a schema to filter by its declared, indexed fields.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addFieldFilter}
            disabled={!draft.schemaKey || fieldOptions.length === 0}
          >
            Add field filter
          </Button>
        </div>
        {draft.schemaKey && schemaVersion.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading fields…</p>
        ) : null}
        {(draft.fields ?? []).map((filter, index) => (
          <div key={`${filter.path}:${index}`} className="grid gap-2 rounded-md bg-muted/40 p-2 md:grid-cols-[minmax(12rem,1fr)_10rem_minmax(10rem,1fr)_auto]">
            <Select
              value={filter.path}
              onValueChange={(v) => set({ fields: updateFieldFilter(draft.fields, index, { path: v }) })}
            >
              <SelectTrigger aria-label={`Field ${index + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fieldOptions.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label} ({option.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filter.op}
              onValueChange={(v) => set({ fields: updateFieldFilter(draft.fields, index, { op: v as FieldFilter["op"] }) })}
            >
              <SelectTrigger aria-label={`Field operator ${index + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">contains</SelectItem>
                <SelectItem value="eq">equals</SelectItem>
                <SelectItem value="exists">exists</SelectItem>
                <SelectItem value="gt">greater than</SelectItem>
                <SelectItem value="gte">at least</SelectItem>
                <SelectItem value="lt">less than</SelectItem>
                <SelectItem value="lte">at most</SelectItem>
              </SelectContent>
            </Select>
            {filter.op === "exists" ? (
              <div className="flex items-center rounded-md border border-border bg-background px-3 text-sm text-muted-foreground">
                Present
              </div>
            ) : (
              <Input
                aria-label={`Field value ${index + 1}`}
                value={filter.value ?? ""}
                onChange={(e) => set({ fields: updateFieldFilter(draft.fields, index, { value: e.target.value }) })}
                placeholder="Value"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set({ fields: (draft.fields ?? []).filter((_, i) => i !== index) })}
            >
              Remove
            </Button>
          </div>
        ))}
        {draft.schemaKey && fieldOptions.length === 0 && !schemaVersion.isLoading ? (
          <p className="text-xs text-muted-foreground">This schema has no scalar fields to filter.</p>
        ) : null}
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
