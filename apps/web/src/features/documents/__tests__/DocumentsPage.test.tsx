import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { makeDocumentListResponse, makeDocumentSummary, makeReviewQueueResponse } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { DEMO_WALKTHROUGH_STORAGE_KEY } from "../demo-walkthrough";
import { DocumentsPage } from "../DocumentsPage";

function mockDocumentList() {
  server.use(
    http.get("*/api/review-queue", () => HttpResponse.json(makeReviewQueueResponse())),
    http.get("*/api/documents", ({ request }) => {
      const url = new URL(request.url);
      const search = url.searchParams.get("search");
      if (search) {
        return HttpResponse.json(
          makeDocumentListResponse({
            items: [makeDocumentSummary({ vendorName: `${search} vendor`, originalFilename: `${search.toLowerCase()}.pdf` })],
          }),
        );
      }
      return HttpResponse.json(
        makeDocumentListResponse({
          pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
          items: [
            makeDocumentSummary(),
            makeDocumentSummary({
              id: "22222222-2222-4222-8222-222222222222",
              originalFilename: "greenline-maintenance-invoice.pdf",
              vendorName: "Greenline Maintenance Services",
              reviewStatus: "needs_review",
              openIssues: 1,
            }),
          ],
        }),
      );
    }),
  );
}

describe("DocumentsPage", () => {
  afterEach(() => {
    localStorage.removeItem(DEMO_WALKTHROUGH_STORAGE_KEY);
  });

  it("renders the document library and evaluator walkthrough banner", async () => {
    mockDocumentList();
    renderWithProviders(<DocumentsPage />, { route: "/documents", path: "*" });

    expect(await screen.findByText("Acme Office Supply Co.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /see review → approve → query in action/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /five steps: review → approve → query/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /evaluator guide/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /acme-office-supply-invoice\.pdf/i })).toBeInTheDocument();
  });

  it("expands the walkthrough from the banner", async () => {
    mockDocumentList();
    renderWithProviders(<DocumentsPage />, { route: "/documents", path: "*" });

    expect(await screen.findByText("Acme Office Supply Co.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /five steps: review → approve → query/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /start walkthrough/i }));
    expect(screen.getByRole("heading", { name: /five steps: review → approve → query/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /see review → approve → query in action/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /evaluator guide/i })).toBeInTheDocument();
  });

  it("reopens the walkthrough from the header after dismiss", async () => {
    localStorage.setItem(DEMO_WALKTHROUGH_STORAGE_KEY, "1");
    mockDocumentList();
    renderWithProviders(<DocumentsPage />, { route: "/documents", path: "*" });

    expect(await screen.findByText("Acme Office Supply Co.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /five steps: review → approve → query/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /evaluator guide/i }));
    expect(screen.getByRole("heading", { name: /five steps: review → approve → query/i })).toBeInTheDocument();
  });

  it("shows a recoverable error state when the list request fails", async () => {
    server.use(
      http.get("*/api/review-queue", () => HttpResponse.json(makeReviewQueueResponse())),
      http.get("*/api/documents", () => HttpResponse.error()),
    );
    renderWithProviders(<DocumentsPage />, { route: "/documents", path: "*" });

    expect(await screen.findByText(/could not load documents/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
