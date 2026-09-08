import type { ConfidenceState } from "@invoice/contracts";
import type { FieldSpec, LineItemRowLayout, TextToken } from "./types.js";

export function money(amount: number, currency: string): string {
  const symbol = currency === "EUR" ? "\u20ac" : currency === "GBP" ? "\u00a3" : "$";
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

export function decimal(amount: number): string {
  return amount.toFixed(2);
}

const DEFAULT_SCORE: Record<ConfidenceState, number | null> = {
  high: 0.96,
  medium: 0.72,
  low: 0.41,
  inferred: 0.5,
  conflicting: 0.44,
  missing: null,
};

/** Concise field builder with product-sensible defaults. */
export function field(spec: {
  path: string;
  label: string;
  group: FieldSpec["group"];
  type: FieldSpec["type"];
  extractedValue: unknown | null;
  confidenceState?: ConfidenceState;
  confidenceReason?: string | null;
  confidenceScore?: number | null;
  required?: boolean;
  material?: boolean;
  sourcePath?: string | null;
  sourceTextOverride?: string;
  conflictCandidates?: FieldSpec["conflictCandidates"];
}): FieldSpec {
  const confidenceState = spec.confidenceState ?? "high";
  return {
    path: spec.path,
    label: spec.label,
    group: spec.group,
    type: spec.type,
    extractedValue: spec.extractedValue,
    confidenceState,
    confidenceReason: spec.confidenceReason ?? null,
    confidenceScore:
      spec.confidenceScore !== undefined ? spec.confidenceScore : DEFAULT_SCORE[confidenceState],
    required: spec.required ?? false,
    material: spec.material ?? false,
    sourcePath: spec.sourcePath,
    sourceTextOverride: spec.sourceTextOverride,
    conflictCandidates: spec.conflictCandidates,
  };
}

export interface LineItemInput {
  index: number;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
  lineTotalConfidence?: ConfidenceState;
  lineTotalReason?: string | null;
}

/** Builds a synced layout row + field group for one line item. */
export function lineItem(input: LineItemInput): {
  layoutRow: LineItemRowLayout;
  fields: FieldSpec[];
} {
  const base = `lineItems[${input.index}]`;
  const descToken: TextToken = { text: input.description, sourcePath: `${base}.description` };
  const qtyToken: TextToken = { text: String(input.qty), sourcePath: `${base}.quantity` };
  const unitToken: TextToken = {
    text: money(input.unitPrice, input.currency),
    sourcePath: `${base}.unitPrice`,
  };
  const totalToken: TextToken = {
    text: money(input.lineTotal, input.currency),
    sourcePath: `${base}.lineTotal`,
  };

  return {
    layoutRow: {
      description: descToken,
      qty: qtyToken,
      unitPrice: unitToken,
      lineTotal: totalToken,
    },
    fields: [
      field({
        path: `${base}.description`,
        label: `Line ${input.index + 1} description`,
        group: "lineItems",
        type: "string",
        extractedValue: input.description,
        sourcePath: `${base}.description`,
      }),
      field({
        path: `${base}.quantity`,
        label: `Line ${input.index + 1} quantity`,
        group: "lineItems",
        type: "decimal",
        extractedValue: decimal(input.qty),
        sourcePath: `${base}.quantity`,
      }),
      field({
        path: `${base}.unitPrice`,
        label: `Line ${input.index + 1} unit price`,
        group: "lineItems",
        type: "decimal",
        extractedValue: decimal(input.unitPrice),
        sourcePath: `${base}.unitPrice`,
      }),
      field({
        path: `${base}.lineTotal`,
        label: `Line ${input.index + 1} total`,
        group: "lineItems",
        type: "decimal",
        material: true,
        extractedValue: decimal(input.lineTotal),
        confidenceState: input.lineTotalConfidence ?? "high",
        confidenceReason: input.lineTotalReason ?? null,
        sourcePath: `${base}.lineTotal`,
      }),
    ],
  };
}
