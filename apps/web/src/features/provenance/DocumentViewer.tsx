import * as React from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnnouncer } from "@/components/live-region";
import { DocumentPreviewLoading } from "@/features/review/ReviewLoadingState";
import { useProvenance } from "./provenance-context";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  documentId: string;
  pageCount: number;
}

type LoadState = "loading" | "ready" | "error";

export function DocumentViewer({ documentId, pageCount }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const docRef = React.useRef<pdfjs.PDFDocumentProxy | null>(null);
  const renderTaskRef = React.useRef<pdfjs.RenderTask | null>(null);

  const [state, setState] = React.useState<LoadState>("loading");
  const [page, setPage] = React.useState(1);
  const [zoom, setZoom] = React.useState(1);
  const [renderSize, setRenderSize] = React.useState({ width: 0, height: 0 });
  const { focused, clear } = useProvenance();
  const { announce } = useAnnouncer();

  // Load the PDF document once.
  React.useEffect(() => {
    let cancelled = false;
    setState("loading");
    const task = pdfjs.getDocument(`/api/documents/${documentId}/content`);
    task.promise
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      void task.destroy();
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [documentId]);

  // When a field's source is focused, jump to its page.
  React.useEffect(() => {
    if (focused && focused.page !== page) {
      setPage(focused.page);
    }
    if (focused) {
      announce(`Showing source for ${focused.label} on page ${focused.page}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  // Render the current page whenever page/zoom/doc changes.
  React.useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (state !== "ready" || !doc || !canvas || !container) return;

    let cancelled = false;
    void (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const containerWidth = container.clientWidth - 24;
      const fitScale = containerWidth / baseViewport.width;
      const scale = fitScale * zoom * (window.devicePixelRatio || 1);
      const viewport = pdfPage.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const cssWidth = viewport.width / (window.devicePixelRatio || 1);
      const cssHeight = viewport.height / (window.devicePixelRatio || 1);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      setRenderSize({ width: cssWidth, height: cssHeight });

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTaskRef.current?.cancel();
      const renderTask = pdfPage.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = renderTask;
      try {
        await renderTask.promise;
      } catch {
        /* render cancelled */
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [state, page, zoom]);

  const showHighlight = focused && focused.box && focused.page === page;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="px-2 text-sm text-muted-foreground" aria-live="polite">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <span className="w-12 text-center text-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-auto bg-muted/30 p-3">
        {state === "loading" ? (
          <DocumentPreviewLoading />
        ) : state === "error" ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex max-w-xs flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              <AlertTriangle className="size-6 text-amber-600" aria-hidden="true" />
              <p>The document preview could not be rendered. Field source text is still available in the panel.</p>
            </div>
          </div>
        ) : null}

        <div className={state === "ready" ? "relative mx-auto w-fit" : "hidden"}>
          <canvas ref={canvasRef} className="shadow-sm" aria-label={`Page ${page} of the document`} />
          {showHighlight && focused?.box ? (
            <div
              className="pointer-events-none absolute rounded-sm border-2 border-amber-500 bg-amber-300/30 ring-2 ring-amber-500/40 transition-all"
              style={{
                left: focused.box.x * renderSize.width,
                top: focused.box.y * renderSize.height,
                width: focused.box.width * renderSize.width,
                height: focused.box.height * renderSize.height,
              }}
            />
          ) : null}
        </div>
      </div>

      {focused ? (
        <div className="border-t border-border bg-background p-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{focused.label}</span> source
              {focused.box ? ` (page ${focused.page})` : " — text reference only"}: “{focused.text}”
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
