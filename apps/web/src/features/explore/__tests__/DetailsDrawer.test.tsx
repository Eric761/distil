import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { DOC_ID, makeDetail, makeHistoryResponse, makeQueryResponse } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { ExplorePage } from "../ExplorePage";

describe("Explore details drawer", () => {
  it("opens a per-document drawer with Data, JSON, and History tabs", async () => {
    server.use(
      http.post("*/api/query", () => HttpResponse.json(makeQueryResponse())),
      http.get("*/api/documents/:id/extraction", () =>
        HttpResponse.json(makeDetail({ data: { vendorName: "Acme Office Supply Co." } })),
      ),
      http.get("*/api/documents/:id/history", () => HttpResponse.json(makeHistoryResponse())),
    );

    const user = userEvent.setup();
    renderWithProviders(<ExplorePage />, { route: "/explore?q=USD%20invoices", path: "*" });

    // Open the drawer from the row's Details action.
    const row = (await screen.findByText("Acme Office Supply Co.")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: /open details/i }));

    // The three drill-in tabs are present.
    expect(await screen.findByRole("tab", { name: "Data" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "JSON" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "History" })).toBeInTheDocument();

    // History tab renders the immutable lineage.
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByText("Extraction created")).toBeInTheDocument();

    // Source drill-in opens the full review workspace for this document.
    const openReview = screen.getByRole("link", { name: /open full review/i });
    expect(openReview.getAttribute("href")).toContain(`/documents/${DOC_ID}/review`);
  });

  it("links generic summary values back to their source field", async () => {
    server.use(
      http.post("*/api/query", () =>
        HttpResponse.json(
          makeQueryResponse({
            interpretation: {
              originalText: "Orbital Cloud Migration",
              filters: { search: "orbital cloud migration" },
              chips: [{ key: "search", label: "Search", display: "orbital cloud migration" }],
              unparsedTerms: [],
              warnings: [],
              needsClarification: false,
            },
            items: [
              {
                documentId: DOC_ID,
                originalFilename: "orbital-cloud-project-brief.md",
                documentType: "document",
                documentFormat: "markdown",
                schemaName: "Orbital Cloud Migration",
                vendorName: null,
                invoiceNumber: null,
                invoiceDate: null,
                currency: null,
                total: null,
                summaryValues: [
                  {
                    key: "owner",
                    label: "Owner",
                    value: "Dana Whitfield",
                    source: { documentId: DOC_ID, fieldPath: "owner", page: null, hasBox: false },
                  },
                ],
                reviewStatus: "approved",
                openIssues: 0,
                updatedAt: "2024-09-12T10:05:00.000Z",
                totalSource: null,
              },
            ],
            pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
            summary: { totalCount: 1, byCurrency: [], bySchema: [{ schemaKey: "document", schemaName: "Orbital Cloud Migration", count: 1 }] },
          }),
        ),
      ),
    );

    renderWithProviders(<ExplorePage />, { route: "/explore?q=Orbital%20Cloud%20Migration", path: "*" });

    const row = (await screen.findByText("Dana Whitfield")).closest("tr")!;
    const sourceLink = within(row).getByRole("link", { name: /view source/i });
    expect(sourceLink.getAttribute("href")).toContain(`focusField=owner`);
  });
});
