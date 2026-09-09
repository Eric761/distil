import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, UploadCloud, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError, NetworkError } from "@/lib/api-client";
import { useUploadDocument } from "./api";
import { validateUploadFile } from "./upload-validation";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; loaded: number; total: number }
  | { kind: "error"; message: string; duplicateId?: string }
  | { kind: "done" };

export function UploadDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const upload = useUploadDocument();
  const navigate = useNavigate();

  const reset = () => {
    setPhase({ kind: "idle" });
    abortRef.current = null;
  };

  const handleFile = (file: File) => {
    const error = validateUploadFile(file);
    if (error) {
      setPhase({ kind: "error", message: error });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "uploading", loaded: 0, total: file.size });
    upload.mutate(
      {
        file,
        signal: controller.signal,
        onProgress: (p) => setPhase({ kind: "uploading", loaded: p.loaded, total: p.total }),
      },
      {
        onSuccess: (res) => {
          setPhase({ kind: "done" });
          setOpen(false);
          reset();
          navigate(`/documents/${res.document.id}/review`);
        },
        onError: (err) => {
          if (err instanceof DOMException && err.name === "AbortError") {
            reset();
            return;
          }
          if (err instanceof ApiError && err.code === "DUPLICATE_DOCUMENT") {
            const dup = err.problem.meta?.document as { id: string } | undefined;
            setPhase({ kind: "error", message: err.problem.detail, duplicateId: dup?.id });
            return;
          }
          const message = err instanceof NetworkError ? err.message : err instanceof ApiError ? err.problem.detail : "Upload failed.";
          setPhase({ kind: "error", message });
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          abortRef.current?.abort();
          reset();
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload an invoice</DialogTitle>
          <DialogDescription>
            PDF only, up to 5 MB. Use a seeded sample invoice to see extraction — other uploads are
            stored, not processed
          </DialogDescription>
        </DialogHeader>

        <div
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center ${
            dragging ? "border-primary bg-primary/5" : "border-input"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <UploadCloud className="size-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={phase.kind === "uploading"}
            >
              Choose a PDF
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">or drag and drop it here</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="Choose a PDF file to upload"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {phase.kind === "uploading" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Uploading… {Math.round((phase.loaded / Math.max(1, phase.total)) * 100)}%</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  abortRef.current?.abort();
                  reset();
                }}
              >
                <X className="size-4" aria-hidden="true" /> Cancel
              </Button>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round((phase.loaded / Math.max(1, phase.total)) * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-all" style={{ width: `${(phase.loaded / Math.max(1, phase.total)) * 100}%` }} />
            </div>
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-2">
              <p>{phase.message}</p>
              {phase.duplicateId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/documents/${phase.duplicateId}/review`);
                  }}
                >
                  Open existing record
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={reset}>
                  Try another file
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
