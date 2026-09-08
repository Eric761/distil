import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { makeQueryResponse, DOC_ID } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { QueryPage } from "../QueryPage";

describe("QueryPage", () => {
  it("loads approved records by default before any query is entered", async () => {
    server.use(
      http.post("*/api/query", () =>
        HttpResponse.json(
          makeQueryResponse({
            interpretation: {
              originalText: "",
              filters: {},
              chips: [],
              unparsedTerms: [],
              warnings: [],
              needsClarification: false,
            },
          }),
        ),
      ),
    );

    renderWithProviders(<QueryPage />, { route: "/query", path: "*" });

    expect(await screen.findByText("Acme Office Supply Co.")).toBeInTheDocument();
    expect(screen.queryByText(/Interpreted .+ as:/i)).not.toBeInTheDocument();
  });

  it("interprets a query into visible, editable filter chips and shows results with a source link", async () => {
    server.use(
      http.post("*/api/query", () => HttpResponse.json(makeQueryResponse())),
    );

    renderWithProviders(<QueryPage />, {
      route: "/query?q=USD%20invoices%20over%20500",
      path: "*",
    });

    // Interpretation chips are shown as human-readable, editable facets. The
    // chip text is split across child nodes ("Total" + ": " + "> 500.00"), so
    // match on the badge element's full text content.
    expect(
      await screen.findByText((_, el) => el?.textContent === "Total: > 500.00"),
    ).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "Currency: USD")).toBeInTheDocument();

    // The result row comes from the (mocked) backend, not a frontend fixture list.
    const row = (await screen.findByText("Acme Office Supply Co.")).closest("tr")!;
    expect(within(row).getByText("$868.00")).toBeInTheDocument();
    // Issue-count column reflects the row's openIssues (0 -> All clear).
    expect(within(row).getByText("All clear")).toBeInTheDocument();

    // Traceability: the total cell links back to the source field/page.
    const link = within(row).getByRole("link", { name: /view total source/i });
    expect(link.getAttribute("href")).toContain(`/documents/${DOC_ID}/review`);
    expect(link.getAttribute("href")).toContain("focusField=total");
  });

  it("surfaces interpretation warnings without hiding results", async () => {
    server.use(
      http.post("*/api/query", () =>
        HttpResponse.json(
          makeQueryResponse({
            interpretation: {
              originalText: "invoices over 500",
              filters: { amount: { comparator: "gt", value: "500.00" } },
              chips: [{ key: "amount", label: "Total", display: "> 500.00" }],
              unparsedTerms: [],
              warnings: ["Amounts are compared without converting currencies. Add a currency to be precise."],
              needsClarification: false,
            },
          }),
        ),
      ),
    );

    renderWithProviders(<QueryPage />, { route: "/query?q=invoices%20over%20500", path: "*" });
    expect(await screen.findByText(/compared without converting currencies/i)).toBeInTheDocument();
  });

  it("shows an explicit no-results state that names the active filters", async () => {
    server.use(
      http.post("*/api/query", () =>
        HttpResponse.json(
          makeQueryResponse({
            items: [],
            pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
          }),
        ),
      ),
    );

    renderWithProviders(<QueryPage />, { route: "/query?q=USD%20invoices%20over%2050000", path: "*" });
    expect(await screen.findByText(/No records match these filters/i)).toBeInTheDocument();
    // The empty state names the active filters and offers a one-click reset.
    expect(screen.getByText("Active:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear all filters/i })).toBeInTheDocument();
  });

  it("preserves filters and offers retry when the query fails", async () => {
    server.use(
      http.post("*/api/query", () =>
        HttpResponse.json(
          { code: "INTERNAL", title: "Boom", detail: "Server error", status: 500 },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<QueryPage />, { route: "/query?q=USD%20invoices", path: "*" });
    expect(await screen.findByText(/The query failed, but your filters are preserved\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("summarizes the full result set and exports it as a downloadable file", async () => {
    server.use(http.post("*/api/query", () => HttpResponse.json(makeQueryResponse())));

    renderWithProviders(<QueryPage />, { route: "/query?q=USD%20invoices%20over%20500", path: "*" });

    // Summary strip reflects the aggregate (currency-bucketed, whole result set).
    const summary = (await screen.findByText(/total \(USD\)/i)).closest("div")!;
    expect(within(summary).getByText("$868.00")).toBeInTheDocument();

    // Export triggers a real client-side download (jsdom lacks these APIs).
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    clickSpy.mockRestore();
  });
});
