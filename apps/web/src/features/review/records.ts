import type { ExtractionField, SchemaTree } from "@invoice/contracts";

const ARRAY_PATH = /^([A-Za-z0-9_]+)\[(\d+)\]\.(.+)$/u;

export interface RecordRow {
  index: number;
  cells: Record<string, ExtractionField>;
}

export interface RecordGroup {
  key: string;
  label: string;
  /** Column keys in first-seen order. */
  columns: string[];
  columnLabels: Record<string, string>;
  rows: RecordRow[];
}

export interface DerivedFields {
  /** Top-level scalar (non-repeated) fields. */
  scalarFields: ExtractionField[];
  /** Repeated records (arrays of objects), e.g. invoice line items. */
  records: RecordGroup[];
}

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/^\w/u, (c) => c.toUpperCase());
}

/**
 * Split a flat field list into top-level scalars and repeated record groups.
 * A repeated record is any field whose instance path is `arrayKey[i].column`;
 * these are grouped by array key + row index so the review UI can render an
 * editable record table for any schema (invoice line items, resume roles, …).
 */
export function deriveFields(fields: ExtractionField[], schema?: SchemaTree): DerivedFields {
  const scalarFields: ExtractionField[] = [];
  const groupMap = new Map<string, RecordGroup>();

  for (const field of fields) {
    const m = ARRAY_PATH.exec(field.path);
    if (!m) {
      scalarFields.push(field);
      continue;
    }
    const [, arrayKey, indexStr, column] = m;
    const index = Number(indexStr);
    let group = groupMap.get(arrayKey!);
    if (!group) {
      const schemaField = schema?.fields.find((f) => f.key === arrayKey);
      group = {
        key: arrayKey!,
        label: schemaField?.label ?? humanize(arrayKey!),
        columns: [],
        columnLabels: {},
        rows: [],
      };
      groupMap.set(arrayKey!, group);
    }
    if (!group.columns.includes(column!)) {
      group.columns.push(column!);
      group.columnLabels[column!] = field.label || humanize(column!);
    }
    let row = group.rows.find((r) => r.index === index);
    if (!row) {
      row = { index, cells: {} };
      group.rows.push(row);
    }
    row.cells[column!] = field;
  }

  for (const group of groupMap.values()) {
    group.rows.sort((a, b) => a.index - b.index);
  }

  return { scalarFields, records: [...groupMap.values()] };
}

/** Ordered section groups for scalar fields, following schema order when known. */
export function groupScalarSections(
  scalarFields: ExtractionField[],
  schema?: SchemaTree,
): Array<{ group: string; fields: ExtractionField[] }> {
  const order: string[] = [];
  const byGroup = new Map<string, ExtractionField[]>();
  const pushGroup = (g: string) => {
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      order.push(g);
    }
  };
  // Seed order from schema when available.
  for (const f of schema?.fields ?? []) {
    if (f.nodeKind !== "array") pushGroup(f.group);
  }
  for (const field of scalarFields) {
    pushGroup(field.group);
    byGroup.get(field.group)!.push(field);
  }
  return order
    .filter((g) => (byGroup.get(g)?.length ?? 0) > 0)
    .map((group) => ({ group, fields: byGroup.get(group)! }));
}

const SECTION_LABELS: Record<string, string> = {
  identity: "Identity",
  dates: "Dates and terms",
  amounts: "Amounts",
  metadata: "Metadata",
  lineItems: "Line items",
  details: "Details",
};

export function sectionLabel(group: string): string {
  return SECTION_LABELS[group] ?? humanize(group);
}
