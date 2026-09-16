import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, X } from "lucide-react";
import type { DocumentEvent, ExtractionDetail, QueryResultRow } from "@invoice/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewStatusBadge } from "@/components/status-indicators";
import { cn } from "@/lib/utils";
import { deriveFields, groupScalarSections, sectionLabel } from "@/features/review/records";
import { useDocumentExtraction, useDocumentHistory } from "./api";

const EVENT_LABELS: Record<DocumentEvent["kind"], string> = {
  uploaded: "Uploaded",
  processed: "Processed",
  extraction_created: "Extraction created",
  extraction_promoted: "Extraction promoted",
  corrected: "Corrected",
  schema_reassigned: "Schema reassigned",
  approved: "Approved",
  reopened: "Reopened",
  reprocessed: "Reprocessed",
};

function DataTab({ documentId }: { documentId: string }) {
  const { data, isLoading, isError } = useDocumentExtraction(documentId);
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading extracted data…
      </p>
    );
  }
  if (isError || !data) {
    return <p className="p-4 text-sm text-muted-foreground">Extracted data is not available yet.</p>;
  }
  const { scalarFields, records } = deriveFields(data.fields, data.schema);
  const sections = groupScalarSections(scalarFields, data.schema);
  if (sections.length === 0 && records.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No structured fields were extracted.</p>;
  }
  return (
    <div className="space-y-5 p-4">
      {sections.map(({ group, fields }) => (
        <section key={group} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {sectionLabel(group)}
          </h4>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.id} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="truncate text-sm font-medium text-foreground">
                  {f.presenceState === "present" && f.effectiveValue != null && f.effectiveValue !== ""
                    ? String(f.effectiveValue)
                    : <span className="font-normal text-muted-foreground">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {records.map((group) => (
        <section key={group.key} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </h4>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">#</th>
                  {group.columns.map((col) => (
                    <th key={col} scope="col" className="px-3 py-2 font-medium">
                      {group.columnLabels[col]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.index} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{row.index + 1}</td>
                    {group.columns.map((col) => {
                      const cell = row.cells[col];
                      const value =
                        cell && cell.effectiveValue != null && cell.effectiveValue !== ""
                          ? String(cell.effectiveValue)
                          : "—";
                      return (
                        <td key={col} className="px-3 py-2">
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function JsonTab({ documentId }: { documentId: string }) {
  const { data, isLoading, isError } = useDocumentExtraction(documentId);
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading JSON…
      </p>
    );
  }
  if (isError || !data) {
    return <p className="p-4 text-sm text-muted-foreground">JSON is not available yet.</p>;
  }
  const json = jsonForDetail(data);
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-foreground">
      {json}
    </pre>
  );
}

/** The nested JSON view preserves document structure (never flattened). */
function jsonForDetail(detail: ExtractionDetail): string {
  const hasData = detail.data && Object.keys(detail.data).length > 0;
  return JSON.stringify(hasData ? detail.data : { note: "No structured data extracted." }, null, 2);
}

function HistoryTab({ documentId }: { documentId: string }) {
  const { data, isLoading, isError } = useDocumentHistory(documentId);
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading history…
      </p>
    );
  }
  if (isError || !data || data.events.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No history recorded yet.</p>;
  }
  return (
    <ol className="space-y-3 p-4">
      {data.events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <div className="mt-1 size-2 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{EVENT_LABELS[event.kind]}</span>
              <time className="text-xs text-muted-foreground" dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </div>
            <p className="text-sm text-muted-foreground">{event.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DetailsDrawer({
  row,
  onOpenChange,
  querySearch,
}: {
  row: QueryResultRow | null;
  onOpenChange: (open: boolean) => void;
  querySearch: string;
}) {
  const open = row !== null;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-background shadow-xl focus:outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          )}
          aria-describedby={undefined}
        >
          {row ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-border p-4">
                <div className="min-w-0 space-y-1.5">
                  <DialogPrimitive.Title className="truncate text-base font-semibold">
                    {row.originalFilename}
                  </DialogPrimitive.Title>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="info">{row.documentFormat.toUpperCase()}</Badge>
                    <Badge tone="neutral">{row.schemaName ?? row.documentType}</Badge>
                    <ReviewStatusBadge status={row.reviewStatus} />
                  </div>
                </div>
                <DialogPrimitive.Close
                  className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
                  aria-label="Close details"
                >
                  <X className="size-5" />
                </DialogPrimitive.Close>
              </div>

              <Tabs defaultValue="data" className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border px-4 py-2">
                  <TabsList>
                    <TabsTrigger value="data">Data</TabsTrigger>
                    <TabsTrigger value="json">JSON</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <TabsContent value="data">
                    <DataTab documentId={row.documentId} />
                  </TabsContent>
                  <TabsContent value="json">
                    <JsonTab documentId={row.documentId} />
                  </TabsContent>
                  <TabsContent value="history">
                    <HistoryTab documentId={row.documentId} />
                  </TabsContent>
                </div>
              </Tabs>

              <div className="border-t border-border p-4">
                <Button asChild variant="outline" size="sm">
                  <Link
                    to={{ pathname: `/documents/${row.documentId}/review`, search: "?from=explore" }}
                    state={{ querySearch }}
                  >
                    <ExternalLink className="size-4" aria-hidden="true" /> Open full review
                  </Link>
                </Button>
              </div>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
