import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { documentParse, type DocumentParse } from "@invoice/contracts";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import { DocumentPreviewLoading } from "@/features/review/ReviewLoadingState";
import { useProvenance } from "./provenance-context";

/**
 * The safe source viewer for text-native documents (TXT, Markdown, CSV, HTML).
 * It renders the immutable canonical plain text — never the raw markup — and
 * highlights the focused field's half-open [offsetStart, offsetEnd) span.
 */
export function TextViewer({ documentId }: { documentId: string }) {
  const { focused, clear } = useProvenance();
  const highlightRef = React.useRef<HTMLSpanElement>(null);

  const { data, status } = useQuery({
    queryKey: ["parse", documentId],
    queryFn: ({ signal }) =>
      apiRequest<DocumentParse>(`/documents/${documentId}/parse`, { schema: documentParse, signal }),
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (focused && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focused]);

  if (status === "pending") return <DocumentPreviewLoading />;
  if (status === "error" || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-xs flex-col items-center gap-2 text-center text-sm text-muted-foreground">
          <AlertTriangle className="size-6 text-amber-600" aria-hidden="true" />
          <p>The source text could not be loaded. Field source text is still available in the panel.</p>
        </div>
      </div>
    );
  }

  const start = focused?.offsetStart ?? null;
  const end = focused?.offsetEnd ?? null;
  const hasSpan = start != null && end != null && end > start && end <= data.text.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-2 text-xs text-muted-foreground">
        <span>Canonical source text ({data.sourceKind})</span>
        <span>{data.text.length.toLocaleString()} characters</span>
      </div>
      <div className="flex-1 overflow-auto bg-muted/20 p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
          {hasSpan ? (
            <>
              {data.text.slice(0, start!)}
              <span
                ref={highlightRef}
                className="rounded-sm bg-amber-300/50 ring-1 ring-amber-500/50"
              >
                {data.text.slice(start!, end!)}
              </span>
              {data.text.slice(end!)}
            </>
          ) : (
            data.text
          )}
        </pre>
      </div>
      {focused ? (
        <div className="border-t border-border bg-background p-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{focused.label}</span> source: “{focused.text}”
            </p>
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
