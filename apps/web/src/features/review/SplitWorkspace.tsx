import * as React from "react";
import type { ExtractionDetail, ReviewStatus } from "@invoice/contracts";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProvenanceProvider, useProvenance } from "@/features/provenance/provenance-context";
import { DocumentPreviewLoading } from "./ReviewLoadingState";
import { ReviewForm } from "./ReviewForm";

const DocumentViewer = React.lazy(() =>
  import("@/features/provenance/DocumentViewer").then((m) => ({ default: m.DocumentViewer })),
);

/** Minimum widths (px) each pane keeps so neither can be collapsed to nothing. */
const MIN_DOC_WIDTH = 360;
const MIN_REVIEW_WIDTH = 380;
/** Width of the drag handle between the panes (matches `w-2`). */
const HANDLE_WIDTH = 8;
/** Keyboard resize step (px) for the separator. */
const KEY_STEP = 24;

/** Applies an initial provenance focus from URL params (traceability entry). */
function InitialFocus({ detail, focusFieldPath }: { detail: ExtractionDetail; focusFieldPath?: string }) {
  const { focus } = useProvenance();
  React.useEffect(() => {
    if (!focusFieldPath) return;
    const all = [
      ...detail.fields,
      ...detail.lineItems.flatMap((li) => [li.fields.description, li.fields.quantity, li.fields.unitPrice, li.fields.lineTotal]),
    ];
    const field = all.find((f) => f.path === focusFieldPath);
    const ref = field?.sourceReferences[0];
    if (field && ref) {
      focus({ fieldId: field.id, page: ref.page, box: ref.box, text: ref.sourceText, label: field.label });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFieldPath, detail.extractionId]);
  return null;
}

/** Tracks whether the split layout is active (side-by-side) vs stacked tabs. */
function useIsLargeScreen() {
  const query = "(min-width: 1024px)";
  const [isLarge, setIsLarge] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsLarge(mq.matches);
    mq.addEventListener("change", onChange);
    setIsLarge(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isLarge;
}

export function SplitWorkspace({
  documentId,
  detail,
  reviewStatus,
  focusFieldPath,
}: {
  documentId: string;
  detail: ExtractionDetail;
  reviewStatus: ReviewStatus;
  focusFieldPath?: string;
}) {
  const [tab, setTab] = React.useState<"document" | "fields">(focusFieldPath ? "document" : "fields");
  const pageCount = detail.pages.length;

  const isLarge = useIsLargeScreen();
  const containerRef = React.useRef<HTMLDivElement>(null);
  // Explicit document-pane width (px). `null` = use the default flex ratio.
  const [docWidth, setDocWidth] = React.useState<number | null>(null);
  const draggingRef = React.useRef(false);

  // Clamp so BOTH panes always keep their minimum — this is the "max limit"
  // that stops the review panel from collapsing until nothing is visible.
  const clampDocWidth = React.useCallback((width: number, containerWidth: number) => {
    const max = containerWidth - MIN_REVIEW_WIDTH - HANDLE_WIDTH;
    if (max < MIN_DOC_WIDTH) {
      // Container too narrow to honor both minimums: split what's available.
      return Math.max(0, (containerWidth - HANDLE_WIDTH) / 2);
    }
    return Math.min(max, Math.max(MIN_DOC_WIDTH, width));
  }, []);

  const resizeFromClientX = React.useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setDocWidth(clampDocWidth(clientX - rect.left, rect.width));
    },
    [clampDocWidth],
  );

  // Keep the panes valid when the window (and thus the container) resizes, so a
  // shrinking viewport can never push the review panel below its minimum.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setDocWidth((w) => (w == null ? w : clampDocWidth(w, el.getBoundingClientRect().width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampDocWidth]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    resizeFromClientX(e.clientX);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const current = docWidth ?? rect.width * 0.55;
    setDocWidth(clampDocWidth(current + (e.key === "ArrowRight" ? KEY_STEP : -KEY_STEP), rect.width));
  };
  const handleDoubleClick = () => setDocWidth(null); // reset to default ratio

  // Fixed basis only applies while side-by-side; stacked/tab mode is full width.
  const docStyle: React.CSSProperties | undefined = isLarge
    ? { minWidth: MIN_DOC_WIDTH, ...(docWidth != null ? { flex: `0 0 ${docWidth}px` } : {}) }
    : undefined;
  const reviewStyle: React.CSSProperties | undefined = isLarge ? { minWidth: MIN_REVIEW_WIDTH } : undefined;

  return (
    <ProvenanceProvider>
      <InitialFocus detail={detail} focusFieldPath={focusFieldPath} />

      <div className="lg:hidden">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="document" className="flex-1">Document</TabsTrigger>
            <TabsTrigger value="fields" className="flex-1">Fields</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div
        ref={containerRef}
        className="flex min-h-[70vh] flex-col overflow-hidden rounded-lg border border-border bg-card lg:h-[calc(100vh-11rem)] lg:flex-row"
      >
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 border-border lg:flex-[1.2]",
            tab !== "document" && "hidden lg:block",
          )}
          style={docStyle}
        >
          <React.Suspense
            fallback={
              <DocumentPreviewLoading />
            }
          >
            <DocumentViewer documentId={documentId} pageCount={pageCount} />
          </React.Suspense>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize document and review panels"
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
          onDoubleClick={handleDoubleClick}
          className="hidden shrink-0 cursor-col-resize items-center justify-center border-x border-border bg-muted/40 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring lg:flex lg:w-2"
        >
          <div className="h-8 w-0.5 rounded-full bg-border" aria-hidden="true" />
        </div>

        <div
          className={cn("min-h-0 min-w-0 flex-1", tab !== "fields" && "hidden lg:block")}
          style={reviewStyle}
        >
          <ReviewForm documentId={documentId} detail={detail} reviewStatus={reviewStatus} />
        </div>
      </div>
    </ProvenanceProvider>
  );
}
