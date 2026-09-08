import type { ExtractionField, LineItemRow } from "@invoice/contracts";

/**
 * Line items are rendered as labeled groups so every cell keeps an accessible
 * label and can host the same confirm/correct controls as top-level fields.
 * This stays usable at narrow widths where a dense grid would not.
 */
export function LineItemsEditor({
  lineItems,
  renderField,
}: {
  lineItems: LineItemRow[];
  renderField: (field: ExtractionField) => React.ReactNode;
}) {
  if (lineItems.length === 0) {
    return <p className="text-sm text-muted-foreground">No line items were extracted.</p>;
  }

  return (
    <ul className="space-y-3" aria-label="Line items">
      {lineItems.map((row) => (
        <li key={row.id} className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Line {row.position + 1}
          </p>
          <div className="space-y-2">
            {renderField(row.fields.description)}
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(13rem, 100%), 1fr))" }}
            >
              {renderField(row.fields.quantity)}
              {renderField(row.fields.unitPrice)}
              {renderField(row.fields.lineTotal)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
