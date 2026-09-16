import type { DocumentSummary } from "@invoice/contracts";
import { formatMoney } from "./utils";

export const DOCUMENT_FORMAT_LABELS: Record<DocumentSummary["documentFormat"], string> = {
  pdf: "PDF",
  txt: "Text",
  markdown: "Markdown",
  csv: "CSV",
  html: "HTML",
};

function documentCategoryLabel(summary: DocumentSummary): string {
  return summary.schemaName ?? (summary.documentType === "invoice" ? "Invoice" : "Unclassified");
}

function joinSubtitleParts(parts: Array<string | null | undefined>): string {
  return parts.filter((part) => part != null && part !== "" && part !== "—").join(" · ");
}

/** One-line subtitle under a document title (review header, etc.). */
export function formatDocumentSubtitle(summary: DocumentSummary): string {
  const category = documentCategoryLabel(summary);
  const format = DOCUMENT_FORMAT_LABELS[summary.documentFormat];

  if (summary.documentType === "invoice") {
    const business = joinSubtitleParts([
      summary.vendorName,
      summary.total ? formatMoney(summary.total, summary.currency) : null,
      summary.invoiceNumber,
    ]);
    return business ? joinSubtitleParts([category, business]) : joinSubtitleParts([category, format]);
  }

  const highlights = summary.summaryValues
    .filter((value) => value.value != null && value.value !== "")
    .slice(0, 2)
    .map((value) => value.value);

  if (highlights.length > 0) {
    return joinSubtitleParts([category, ...highlights]);
  }

  return joinSubtitleParts([category, format]);
}
