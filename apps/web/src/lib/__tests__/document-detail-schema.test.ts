import { describe, expect, it } from "vitest";
import { documentDetail } from "@invoice/contracts";
import { makeDocumentSummary } from "@/test/fixtures";

describe("documentDetail schema", () => {
  it("accepts invoiceRecord dates that are not yet ISO-normalized", () => {
    const parsed = documentDetail.safeParse({
      summary: makeDocumentSummary({
        id: "6a55344e-3199-47c2-a29b-336f74d8e238",
        originalFilename: "cedarworks-studio-invalid-date.pdf",
        vendorName: "CedarWorks Design Studio",
        invoiceNumber: "CW-INV-1038",
        total: "5100.00",
        openIssues: 1,
      }),
      latestAttempt: {
        attemptNumber: 1,
        status: "succeeded",
        phase: null,
        errorCode: null,
        errorMessage: null,
        startedAt: "2024-09-12T10:00:00.000Z",
        finishedAt: "2024-09-12T10:01:00.000Z",
      },
      canRetry: false,
      hasExtraction: true,
      approvedAt: null,
      invoiceRecord: {
        vendorName: "CedarWorks Design Studio",
        invoiceNumber: "CW-INV-1038",
        invoiceDate: "09/17/2024",
        dueDate: "2024-10-17",
        currency: "USD",
        subtotal: "5100.00",
        tax: "0.00",
        total: "5100.00",
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.invoiceRecord?.invoiceDate).toBe("09/17/2024");
    }
  });
});
