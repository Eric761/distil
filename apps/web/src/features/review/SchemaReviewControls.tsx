import * as React from "react";
import { Check, Loader2, RefreshCw, Save } from "lucide-react";
import type { ExtractionDetail, SchemaFieldDef } from "@invoice/contracts";
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
import { Badge } from "@/components/ui/badge";
import { useProcessDocument } from "@/features/documents/api";
import { useSchemas, usePublishSchema, useUpdateDraft } from "@/features/schemas/api";

const FIELD_TYPES = [
  "string",
  "text",
  "integer",
  "decimal",
  "date",
  "datetime",
  "boolean",
  "currency",
  "enum",
] as const;

type ScalarType = (typeof FIELD_TYPES)[number];

interface FieldRow {
  path: string;
  /** Stable structural location; unlike `path`, this does not change while editing the key. */
  trail: number[];
  depth: number;
  field: SchemaFieldDef;
}

function flatten(
  fields: SchemaFieldDef[],
  prefix = "",
  depth = 0,
  parentTrail: number[] = [],
): FieldRow[] {
  const rows: FieldRow[] = [];
  fields.forEach((field, index) => {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    const trail = [...parentTrail, index];
    rows.push({ path, trail, depth, field });
    if (field.nodeKind === "object" && field.children?.length) {
      rows.push(...flatten(field.children, path, depth + 1, trail));
    }
    if (field.nodeKind === "array" && field.item?.children?.length) {
      rows.push(...flatten(field.item.children, path, depth + 1, trail));
    }
  });
  return rows;
}

function updateByTrail(
  fields: SchemaFieldDef[],
  trail: number[],
  patch: Partial<SchemaFieldDef>,
): SchemaFieldDef[] {
  const [targetIndex, ...rest] = trail;
  return fields.map((field, index) => {
    if (index !== targetIndex) return field;
    if (rest.length === 0) return { ...field, ...patch };
    if (field.nodeKind === "object" && field.children) {
      return { ...field, children: updateByTrail(field.children, rest, patch) };
    }
    if (field.nodeKind === "array" && field.item?.children) {
      return {
        ...field,
        item: { ...field.item, children: updateByTrail(field.item.children, rest, patch) },
      };
    }
    return field;
  });
}

export function SchemaReviewControls({
  documentId,
  detail,
}: {
  documentId: string;
  detail: ExtractionDetail;
}) {
  const schemas = useSchemas();
  const process = useProcessDocument(documentId);
  const canEditDraft = detail.schema.status === "draft" && detail.schemaVersionId !== null;
  const updateDraft = useUpdateDraft(detail.schemaVersionId ?? "none");
  const publish = usePublishSchema(detail.schemaVersionId ?? "none");
  const [fields, setFields] = React.useState(detail.schema.fields);
  const [targetVersionId, setTargetVersionId] = React.useState(detail.schemaVersionId ?? "");

  React.useEffect(() => {
    setFields(detail.schema.fields);
  }, [detail.schema.fields]);

  React.useEffect(() => {
    setTargetVersionId(detail.schemaVersionId ?? "");
  }, [detail.schemaVersionId]);

  const published = (schemas.data?.families ?? []).flatMap((family) =>
    family.versions
      .filter((version) => version.status === "published")
      .map((version) => ({
        value: version.versionId,
        label: `${family.name} ${version.version}`,
      })),
  );

  const dirty = JSON.stringify(fields) !== JSON.stringify(detail.schema.fields);
  const rows = flatten(fields);
  const isCurrentSchema = targetVersionId !== "" && targetVersionId === detail.schemaVersionId;

  return (
    <section className="mb-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Schema</h3>
            <Badge tone={detail.schema.status === "published" ? "success" : "warning"}>
              {detail.schema.name} · {detail.schema.status}
            </Badge>
            {detail.schema.adHoc ? <Badge tone="neutral">inferred</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Edit inferred draft fields here, publish to freeze for reuse, or re-extract with another published schema.
          </p>
        </div>
        {canEditDraft ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || updateDraft.isPending}
              onClick={() => updateDraft.mutate(fields)}
            >
              {updateDraft.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save schema
            </Button>
            <Button size="sm" disabled={publish.isPending} onClick={() => publish.mutate()}>
              {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Publish and reuse
            </Button>
          </div>
        ) : null}
      </div>

      {canEditDraft ? (
        <div className="mt-3 max-h-64 overflow-auto rounded-md border border-border bg-background">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ path, trail, depth, field }) => (
                <tr key={trail.join(".")} className="border-b border-border last:border-0">
                  <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 14}px` }}>
                    <Input
                      value={field.key}
                      className="h-8 font-mono text-xs"
                      aria-label={`Schema key for ${path}`}
                      onChange={(e) => setFields((prev) => updateByTrail(prev, trail, { key: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={field.label}
                      className="h-8 text-xs"
                      aria-label={`Schema label for ${path}`}
                      onChange={(e) => setFields((prev) => updateByTrail(prev, trail, { label: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {field.nodeKind === "scalar" ? (
                      <Select
                        value={field.type}
                        onValueChange={(value) =>
                          setFields((prev) => updateByTrail(prev, trail, { type: value as ScalarType }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs" aria-label={`Schema type for ${path}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">{field.nodeKind}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-1">
          <Label htmlFor="schema-reextract-target">Re-extract with published schema</Label>
          <Select value={targetVersionId || undefined} onValueChange={setTargetVersionId}>
            <SelectTrigger id="schema-reextract-target" aria-label="Published schema">
              <SelectValue placeholder="Choose schema version" />
            </SelectTrigger>
            <SelectContent>
              {published.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  {option.value === detail.schemaVersionId ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!targetVersionId || isCurrentSchema || process.isPending}
          onClick={() =>
            process.mutate({
              mode: "reextract",
              schemaVersionId: targetVersionId,
              forceReparse: false,
            })
          }
        >
          {process.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {isCurrentSchema ? "Already extracted" : "Re-extract"}
        </Button>
      </div>
    </section>
  );
}
