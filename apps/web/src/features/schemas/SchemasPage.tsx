import * as React from "react";
import {
  AlertTriangle,
  Check,
  CornerDownRight,
  LayoutGrid,
  Loader2,
  Lock,
  Search,
  Save,
} from "lucide-react";
import type { SchemaFieldDef } from "@invoice/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useSchemas, useSchemaVersion, useUpdateDraft, usePublishSchema } from "./api";

function StatusBadge({ status, adHoc }: { status: string; adHoc: boolean }) {
  if (status === "published") return <Badge tone="success">Published</Badge>;
  return <Badge tone="warning">{adHoc ? "Draft · inferred" : "Draft"}</Badge>;
}

interface FlatField {
  field: SchemaFieldDef;
  depth: number;
  path: string;
  trail: number[];
}

/** Flatten the tree with immutable structural trails and unambiguous field paths. */
function flattenFields(
  fields: SchemaFieldDef[],
  depth = 0,
  prefix = "",
  parentTrail: number[] = [],
): FlatField[] {
  const rows: FlatField[] = [];
  fields.forEach((field, index) => {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    const trail = [...parentTrail, index];
    rows.push({ field, depth, path, trail });
    if (field.nodeKind === "object" && field.children?.length) {
      rows.push(...flattenFields(field.children, depth + 1, path, trail));
    }
    if (field.nodeKind === "array" && field.item?.children?.length) {
      rows.push(...flattenFields(field.item.children, depth + 1, path, trail));
    }
  });
  return rows;
}

function trailKey(trail: number[]): string {
  return trail.join(".");
}

function VersionDetail({
  versionId,
  onDirtyChange,
}: {
  versionId: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { data, isLoading, isError } = useSchemaVersion(versionId);
  const update = useUpdateDraft(versionId);
  const publish = usePublishSchema(versionId);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [dirty, setDirty] = React.useState(false);
  const [showPublish, setShowPublish] = React.useState(false);

  // Reset local edits whenever the selected version changes.
  React.useEffect(() => {
    setLabels({});
    setDirty(false);
    setShowPublish(false);
  }, [versionId]);

  React.useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="p-4 text-sm text-muted-foreground">This schema version could not be loaded.</p>;
  }

  const editable = data.status === "draft";
  const rows = flattenFields(data.fields);
  const labelFor = (trail: number[], fallback: string) => labels[trailKey(trail)] ?? fallback;

  const buildFields = (
    fields: SchemaFieldDef[],
    parentTrail: number[] = [],
  ): SchemaFieldDef[] =>
    fields.map((f, index) => {
      const trail = [...parentTrail, index];
      return {
        ...f,
        label: labels[trailKey(trail)] ?? f.label,
        children: f.children ? buildFields(f.children, trail) : f.children,
        item: f.item
          ? {
              ...f.item,
              children: f.item.children ? buildFields(f.item.children, trail) : f.item.children,
            }
          : f.item,
      };
    });

  const onSave = () => {
    update.mutate(buildFields(data.fields), { onSuccess: () => setDirty(false) });
  };

  const onPublish = async () => {
    try {
      if (dirty) {
        await update.mutateAsync(buildFields(data.fields));
        setDirty(false);
      }
      await publish.mutateAsync();
      setShowPublish(false);
    } catch {
      // Mutation state renders the actionable server error below the header.
    }
  };
  const busy = update.isPending || publish.isPending;
  const mutationError = update.error ?? publish.error;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{data.name}</h3>
            <Badge tone="neutral">{data.version}</Badge>
            <StatusBadge status={data.status} adHoc={data.adHoc} />
          </div>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "field" : "fields"} · {data.fields.length} top-level
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editable ? (
            <>
              <Button size="sm" variant="outline" onClick={onSave} disabled={!dirty || update.isPending}>
                {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                Save labels
              </Button>
              <Button size="sm" onClick={() => setShowPublish(true)} disabled={busy}>
                {publish.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                {dirty ? "Save & publish" : "Publish version"}
              </Button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" aria-hidden="true" /> Published versions are immutable
            </span>
          )}
        </div>
      </div>

      {mutationError ? (
        <p className="flex items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          {(mutationError as ApiError)?.problem?.detail ?? "The schema change could not be saved."}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center p-6 text-center">
            <div>
              <p className="font-medium">No fields in this schema</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add fields from a document review before publishing this version.
              </p>
            </div>
          </div>
        ) : (
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[34%]" />
            <col className="w-[12%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">Field</th>
              <th scope="col" className="px-4 py-2 font-medium">Label</th>
              <th scope="col" className="px-4 py-2 font-medium">Type</th>
              <th scope="col" className="px-4 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ field, depth, path, trail }) => (
              <tr key={trailKey(trail)} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2 font-mono text-xs" style={{ paddingLeft: `${16 + depth * 16}px` }}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    {depth > 0 ? <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                    <span className="truncate" title={path}>{path}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  {editable ? (
                    <Input
                      value={labelFor(trail, field.label)}
                      onChange={(e) => {
                        setLabels((prev) => ({ ...prev, [trailKey(trail)]: e.target.value }));
                        setDirty(true);
                      }}
                      className="h-8"
                      aria-label={`Label for ${path}`}
                    />
                  ) : (
                    field.label
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {field.nodeKind === "scalar" ? field.type : field.nodeKind}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {field.required ? <Badge tone="info">required</Badge> : null}
                    {field.material ? <Badge tone="neutral">material</Badge> : null}
                    {field.isSummary ? <Badge tone="neutral">summary</Badge> : null}
                    {field.semanticKey ? <Badge tone="neutral">{field.semanticKey}</Badge> : null}
                    {!field.required && !field.material && !field.isSummary && !field.semanticKey ? (
                      <span className="text-muted-foreground">—</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      <Dialog open={showPublish} onOpenChange={setShowPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish this schema version?</DialogTitle>
            <DialogDescription>
              Publishing creates an immutable reusable version. Any unsaved label changes will be saved first.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <span className="font-medium">{data.name}</span>
            <span className="text-muted-foreground"> · {rows.length} fields</span>
          </div>
          {mutationError ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {(mutationError as ApiError)?.problem?.detail ?? "The schema could not be published."}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublish(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void onPublish()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SchemasPage() {
  const { data, isLoading, isError } = useSchemas();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "draft" | "published">("all");
  const [detailDirty, setDetailDirty] = React.useState(false);
  const [pendingSelection, setPendingSelection] = React.useState<string | null>(null);
  const handleDirtyChange = React.useCallback((dirty: boolean) => setDetailDirty(dirty), []);

  // Default the selection to the first family's newest version once loaded.
  const firstVersionId = data?.families[0]?.versions[0]?.versionId ?? null;
  React.useEffect(() => {
    if (!selected && firstVersionId) setSelected(firstVersionId);
  }, [firstVersionId, selected]);

  const visibleFamilies = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.families ?? [])
      .map((family) => ({
        ...family,
        versions: family.versions.filter((version) =>
          statusFilter === "all" ? true : version.status === statusFilter,
        ),
      }))
      .filter(
        (family) =>
          family.versions.length > 0 &&
          (!term ||
            family.name.toLowerCase().includes(term) ||
            family.key.toLowerCase().includes(term)),
      );
  }, [data?.families, search, statusFilter]);

  const selectVersion = (versionId: string) => {
    if (versionId === selected) return;
    if (detailDirty) {
      setPendingSelection(versionId);
      return;
    }
    setSelected(versionId);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <PageHeader
        icon={<LayoutGrid className="size-6" aria-hidden="true" />}
        title="Schemas"
        description="The reusable, versioned shapes documents are extracted against. Inferred proposals start as drafts; publish to freeze an immutable version and route future documents to it."
      />

      {isError ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm">
            <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
            The schema library could not be loaded.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]" aria-busy="true">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !data || data.families.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No schemas yet. Upload a document to infer one, or approve an invoice to use the built-in schema.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto" aria-label="Schema library">
            <div className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-8"
                  placeholder="Search schemas"
                  aria-label="Search schemas"
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger aria-label="Schema status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All versions</SelectItem>
                  <SelectItem value="draft">Drafts</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {visibleFamilies.map((family) => {
              const familySelected = family.versions.some((version) => version.versionId === selected);
              return (
              <div
                key={family.key}
                className={cn(
                  "rounded-lg border bg-card transition-colors",
                  familySelected ? "border-primary/40 shadow-sm" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium" title={family.name}>{family.name}</span>
                      {family.builtIn ? <Badge tone="info">built-in</Badge> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {family.documentCount} {family.documentCount === 1 ? "document" : "documents"}
                    </span>
                  </div>
                </div>
                <ul className="divide-y divide-border">
                  {family.versions.map((v) => (
                    <li key={v.versionId}>
                      <button
                        type="button"
                        onClick={() => selectVersion(v.versionId)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                          selected === v.versionId && "bg-primary/10",
                        )}
                        aria-current={selected === v.versionId}
                      >
                        <span className="font-mono text-xs">{v.version}</span>
                        <span className="flex items-center gap-2">
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {v.documentCount} {v.documentCount === 1 ? "doc" : "docs"}
                          </span>
                          <StatusBadge status={v.status} adHoc={v.adHoc} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              );
            })}

            {visibleFamilies.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No schemas match this search and status.
              </div>
            ) : null}
          </aside>

          <div className="flex min-h-[320px] flex-col rounded-lg border border-border bg-card">
            {selected ? (
              <VersionDetail versionId={selected} onDirtyChange={handleDirtyChange} />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">Select a version to inspect its fields.</p>
            )}
          </div>
        </div>
      )}

      <Dialog open={pendingSelection !== null} onOpenChange={(open) => !open && setPendingSelection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved label changes?</DialogTitle>
            <DialogDescription>
              You changed this draft but have not saved it. Switching versions now will discard those changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingSelection(null)}>Keep editing</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingSelection) setSelected(pendingSelection);
                setPendingSelection(null);
                setDetailDirty(false);
              }}
            >
              Discard and switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
