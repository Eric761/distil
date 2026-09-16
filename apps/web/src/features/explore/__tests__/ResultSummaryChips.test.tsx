import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultSummaryChips, shouldShowSchemaChips } from "../ResultSummaryChips";

describe("ResultSummaryChips", () => {
  it("renders record, currency, and schema chips with distinct labels", () => {
    render(
      <ResultSummaryChips
        summary={{
          totalCount: 7,
          byCurrency: [
            { currency: "USD", count: 3, total: "2505.28" },
            { currency: "GBP", count: 1, total: "3900.00" },
          ],
          bySchema: [
            { schemaKey: "invoice", schemaName: "Invoice", count: 3 },
            { schemaKey: "document", schemaName: "Incident Retrospective: Checkout Latency", count: 1 },
          ],
        }}
      />,
    );

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("records")).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("$2,505.28")).toBeInTheDocument();
    expect(screen.getByText("Invoice")).toBeInTheDocument();
    expect(screen.getByText("Incident Retrospective: Checkout Latency")).toBeInTheDocument();
  });

  it("hides a lone invoice schema chip when currency totals are present", () => {
    expect(
      shouldShowSchemaChips({
        totalCount: 3,
        byCurrency: [{ currency: "USD", count: 3, total: "868.00" }],
        bySchema: [{ schemaKey: "invoice", schemaName: "Invoice", count: 3 }],
      }),
    ).toBe(false);
  });

  it("shows schema chips for non-invoice result sets", () => {
    expect(
      shouldShowSchemaChips({
        totalCount: 1,
        byCurrency: [],
        bySchema: [{ schemaKey: "document", schemaName: "Orbital Cloud Migration", count: 1 }],
      }),
    ).toBe(true);
  });
});
