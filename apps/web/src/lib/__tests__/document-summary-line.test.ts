import { describe, expect, it } from "vitest";
import { makeDocumentSummary } from "@/test/fixtures";
import { formatDocumentSubtitle } from "../document-summary-line";

describe("formatDocumentSubtitle", () => {
  it("shows invoice business fields when available", () => {
    const summary = makeDocumentSummary({
      documentType: "invoice",
      schemaName: "Invoice",
      vendorName: "Acme Office Supply Co.",
      total: "868.00",
      currency: "USD",
      invoiceNumber: "INV-1001",
    });
    expect(formatDocumentSubtitle(summary)).toBe(
      "Invoice · Acme Office Supply Co. · $868.00 · INV-1001",
    );
  });

  it("falls back to type and format for invoices without extracted business values", () => {
    const summary = makeDocumentSummary({
      documentType: "invoice",
      schemaName: "Invoice",
      vendorName: null,
      total: null,
      invoiceNumber: null,
      documentFormat: "pdf",
    });
    expect(formatDocumentSubtitle(summary)).toBe("Invoice · PDF");
  });

  it("shows generic schema summary values for non-invoice documents", () => {
    const summary = makeDocumentSummary({
      documentType: "document",
      schemaName: "Resume",
      documentFormat: "pdf",
      vendorName: null,
      total: null,
      summaryValues: [
        { key: "candidateName", label: "Candidate name", value: "Alex Morgan" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ],
    });
    expect(formatDocumentSubtitle(summary)).toBe("Resume · Alex Morgan · alex@example.com");
  });
});
