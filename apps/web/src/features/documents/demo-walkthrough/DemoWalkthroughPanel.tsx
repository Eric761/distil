import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDocumentList } from "../api";
import { DEMO_WALKTHROUGH_STEPS } from "./steps";

const JOURNEY_STEPS = [
  { label: "Review", detail: "Fix failed extractions and open issues" },
  { label: "Approve", detail: "Publish trusted records and schemas" },
  { label: "Explore", detail: "Filter approved records and inspect proof" },
];

const launcherClassName =
  "h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-lg border border-border/70 bg-card/85 p-3 text-left shadow-sm hover:border-primary/35 hover:bg-primary/[0.04]";

function DocumentStepButton({
  search,
  title,
  lesson,
  stepNumber,
}: Readonly<{ search: string; title: string; lesson: string; stepNumber: number }>) {
  const navigate = useNavigate();
  const { data, isLoading } = useDocumentList({ search, page: 1, pageSize: 1, sort: "updatedAt", direction: "desc" });
  const doc = data?.items[0];

  return (
    <Button
      size="sm"
      variant="ghost"
      className={launcherClassName}
      disabled={isLoading || !doc}
      onClick={() => doc && navigate(`/documents/${doc.id}/review`)}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {stepNumber}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-foreground">{title}</span>
        <span className="mt-0.5 line-clamp-2 block min-h-[2.5rem] text-xs leading-snug text-muted-foreground">{lesson}</span>
      </span>
      <ArrowRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
    </Button>
  );
}

export function DemoWalkthroughPanel({ onDismiss }: Readonly<{ onDismiss: () => void }>) {
  return (
    <section aria-labelledby="demo-walkthrough-title">
      <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/[0.06] via-background to-background shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Compass className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="demo-walkthrough-title" className="text-base font-semibold sm:text-lg">
                  Review → approve → explore in action
                </h2>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  Resolve blockers, approve trusted records, and explore the results — nothing to upload.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Close walkthrough"
              onClick={onDismiss}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3" aria-label="Evaluator guide flow">
            {JOURNEY_STEPS.map((step, index) => (
              <div key={step.label} className="rounded-lg border border-primary/15 bg-primary/[0.035] px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {index + 1}. {step.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-border/60 pt-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open a guided example</p>
              <p className="text-sm text-muted-foreground">
                Choose any sample — order doesn&apos;t matter. Numbers are for reference, not a checklist.
              </p>
            </div>

            <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {DEMO_WALKTHROUGH_STEPS.map((step, index) => (
              <li key={step.title}>
                {step.kind === "document" ? (
                  <DocumentStepButton search={step.search} title={step.title} lesson={step.lesson} stepNumber={index + 1} />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    asChild
                    className={cn(launcherClassName, "border-primary/25 bg-primary/[0.055]")}
                  >
                    <Link to={step.href}>
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-snug text-foreground">{step.title}</span>
                        <span className="mt-0.5 line-clamp-2 block min-h-[2.5rem] text-xs leading-snug text-muted-foreground">{step.lesson}</span>
                      </span>
                      <ArrowRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </li>
            ))}
            </ol>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
