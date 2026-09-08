import { cn } from "@/lib/utils";

/**
 * Distil logomark: four converging strokes that narrow toward a single line —
 * a visual metaphor for "structure from chaos" / distillation. Uses
 * `currentColor` so it inherits text color and works on any background.
 */
export function DistilMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 6h14" />
      <path d="M7 11h10" />
      <path d="M9.5 16h5" />
      <path d="M11.5 20.5h1" />
    </svg>
  );
}
