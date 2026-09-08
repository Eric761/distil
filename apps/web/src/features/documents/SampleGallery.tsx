import { useNavigate } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAnnouncer } from "@/components/live-region";
import { useIngestSample, useSamples } from "./api";

export function SampleGallery() {
  const samples = useSamples();
  const ingest = useIngestSample();
  const navigate = useNavigate();
  const { announce } = useAnnouncer();

  if (samples.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading samples…</p>;
  }
  if (samples.isError || !samples.data) {
    return <p className="text-sm text-destructive">Could not load sample invoices.</p>;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Sample invoices">
      {samples.data.samples.map((sample) => {
        const pending = ingest.isPending && ingest.variables === sample.fixtureId;
        return (
          <li key={sample.fixtureId}>
            <Card className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-primary" aria-hidden="true" />
                  <h3 className="font-medium">{sample.title}</h3>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {sample.scenario}
                </p>
                <p className="flex-1 text-sm text-muted-foreground">{sample.demonstrates}</p>
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={pending}
                  onClick={() => {
                    ingest.mutate(sample.fixtureId, {
                      onSuccess: (res) => {
                        announce(`${sample.title} added and processing started.`);
                        navigate(`/documents/${res.document.id}/review`);
                      },
                    });
                  }}
                >
                  {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {pending ? "Adding…" : "Load sample"}
                </Button>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
