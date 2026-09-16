import { Coins, FileStack, Layers } from "lucide-react";
import type { QuerySummary } from "@invoice/contracts";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";

const MAX_SCHEMA_CHIPS = 3;

type SchemaBucket = NonNullable<QuerySummary["bySchema"]>[number];

function schemaLabel(bucket: SchemaBucket): string {
  return bucket.schemaName ?? bucket.schemaKey;
}

/** Schema chips add context for mixed or non-invoice result sets; hide a lone Invoice bucket when totals already tell the story. */
export function shouldShowSchemaChips(summary: QuerySummary): boolean {
  const schemas = summary.bySchema ?? [];
  if (schemas.length === 0) return false;
  if (schemas.length > 1) return true;
  return summary.byCurrency.length === 0;
}

export function ResultSummaryChips({ summary }: { summary: QuerySummary }) {
  const schemas = summary.bySchema ?? [];
  const visibleSchemas = schemas.slice(0, MAX_SCHEMA_CHIPS);
  const hiddenSchemas = schemas.slice(MAX_SCHEMA_CHIPS);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Badge
        tone="info"
        className="h-7 rounded-md px-2 py-0"
        title="Matching records in this result set"
      >
        <FileStack aria-hidden="true" />
        <span className="font-semibold">{summary.totalCount.toLocaleString()}</span>
        <span className="font-normal opacity-80">{summary.totalCount === 1 ? "record" : "records"}</span>
      </Badge>

      {summary.byCurrency.length > 0 ? (
        <>
          <span className="hidden h-4 w-px bg-border sm:inline" aria-hidden="true" />
          {summary.byCurrency.map((bucket) => (
            <Badge
              key={bucket.currency ?? "none"}
              tone="success"
              className="h-7 max-w-full rounded-md px-2 py-0"
              title={`${bucket.count} ${bucket.count === 1 ? "record" : "records"} · ${bucket.currency ?? "No currency"} total`}
            >
              <Coins aria-hidden="true" />
              <span className="shrink-0 font-medium">{bucket.currency ?? "—"}</span>
              <span className="truncate font-semibold tabular-nums">{formatMoney(bucket.total, bucket.currency)}</span>
            </Badge>
          ))}
        </>
      ) : null}

      {shouldShowSchemaChips(summary) ? (
        <>
          <span className="hidden h-4 w-px bg-border sm:inline" aria-hidden="true" />
          {visibleSchemas.map((bucket) => (
            <Badge
              key={`${bucket.schemaKey}:${bucket.schemaName ?? ""}`}
              tone="neutral"
              className="h-7 max-w-[11rem] rounded-md px-2 py-0"
              title={`${bucket.count} ${schemaLabel(bucket)} ${bucket.count === 1 ? "record" : "records"}`}
            >
              <Layers aria-hidden="true" />
              <span className="truncate font-medium">{schemaLabel(bucket)}</span>
              <span className="shrink-0 font-semibold tabular-nums">{bucket.count}</span>
            </Badge>
          ))}
          {hiddenSchemas.length > 0 ? (
            <Badge
              tone="neutral"
              className="h-7 rounded-md px-2 py-0"
              title={hiddenSchemas.map(schemaLabel).join(", ")}
            >
              +{hiddenSchemas.length} more
            </Badge>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
