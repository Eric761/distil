import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DemoWalkthroughBanner({
  onStart,
  onDismiss,
}: Readonly<{
  onStart: () => void;
  onDismiss: () => void;
}>) {
  return (
    <section
      aria-labelledby="demo-walkthrough-banner-title"
      className="relative overflow-hidden rounded-lg border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-background px-4 py-3 shadow-sm sm:px-5"
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/[0.06] blur-2xl"
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
            <Compass className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <h2
              id="demo-walkthrough-banner-title"
              className="text-[15px] font-semibold leading-snug tracking-tight text-foreground"
            >
              See review → approve → query in action
            </h2>
            <p className="truncate text-[13px] leading-snug text-muted-foreground">
              Covers failed extractions, open issues, and approvals — nothing to upload
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
          <Button
            size="sm"
            className="border border-primary/35 bg-primary/15 font-semibold text-primary shadow-sm transition-[background-color,border-color,box-shadow] hover:border-primary/45 hover:bg-primary/25 hover:shadow-md"
            onClick={onStart}
          >
            Start walkthrough
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </div>
    </section>
  );
}
