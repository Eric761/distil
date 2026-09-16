import type { ExtractionField } from "@invoice/contracts";
import type { RecordGroup } from "./records";

/**
 * Renders a repeated record group (e.g. invoice line items, resume roles) as
 * labeled row cards. Each cell hosts the same confirm/correct controls as a
 * top-level field, so the editor works for any schema-derived record shape and
 * stays usable at narrow widths where a dense grid would not.
 */
export function RecordTableEditor({
  group,
  renderField,
}: {
  group: RecordGroup;
  renderField: (field: ExtractionField) => React.ReactNode;
}) {
  if (group.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No {group.label.toLowerCase()} were extracted.</p>;
  }

  return (
    <ul className="space-y-3" aria-label={group.label}>
      {group.rows.map((row) => (
        <li key={row.index} className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label} · Row {row.index + 1}
          </p>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(13rem, 100%), 1fr))" }}
          >
            {group.columns.map((column) => {
              const field = row.cells[column];
              return field ? <div key={column}>{renderField(field)}</div> : null;
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
