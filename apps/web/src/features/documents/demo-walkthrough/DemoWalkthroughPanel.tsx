import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDocumentList } from "../api";
import { DEMO_WALKTHROUGH_STEPS } from "./steps";

function DocumentStepButton({ search, title }: Readonly<{ search: string; title: string }>) {
  const navigate = useNavigate();
  const { data, isLoading } = useDocumentList({ search, page: 1, pageSize: 1, sort: "updatedAt", direction: "desc" });
  const doc = data?.items[0];

  return (
    <Button
      size="sm"
      variant="subtle"
      disabled={isLoading || !doc}
      onClick={() => doc && navigate(`/documents/${doc.id}/review`)}
    >
      Open {title}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Button>
  );
}

export function DemoWalkthroughPanel({ onDismiss }: Readonly<{ onDismiss: () => void }>) {
  return (
    <section aria-labelledby="demo-walkthrough-title">
      <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/[0.06] via-background to-background shadow-sm">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Compass className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="demo-walkthrough-title" className="text-base font-semibold sm:text-lg">
                  5-minute evaluator walkthrough
                </h2>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  Follow these steps to see the full trust loop: review uncertain fields, resolve blockers,
                  approve trusted records, then query with traceability back to the source PDF.
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

          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {DEMO_WALKTHROUGH_STEPS.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-border/80 bg-card/90 p-3 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Step {index + 1}
                </p>
                <p className="mt-1 font-medium">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.lesson}</p>
                <div className="mt-3">
                  {step.kind === "document" ? (
                    <DocumentStepButton search={step.search} title={step.title} />
                  ) : (
                    <Button size="sm" variant="subtle" asChild>
                      <Link to={step.href}>
                        Open Query
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}
