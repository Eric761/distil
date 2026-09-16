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
          pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
          items: [
            makeDocumentSummary(),
            makeDocumentSummary({
              id: "22222222-2222-4222-8222-222222222222",
              originalFilename: "greenline-maintenance-invoice.pdf",
              vendorName: "Greenline Maintenance Services",
              reviewStatus: "needs_review",
              openIssues: 1,
            }),
            makeDocumentSummary({
              id: "33333333-3333-4333-8333-333333333333",
              originalFilename: "functional-resume.pdf",
              documentType: "document",
              schemaName: "Resume",
              vendorName: null,
              invoiceNumber: null,
              total: null,
              currency: null,
              summaryValues: [
                { key: "candidate", label: "Candidate", value: "John W. Smith" },
                { key: "experience", label: "Experience", value: "Adult care" },
              ],
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
    expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Summary" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Vendor" })).not.toBeInTheDocument();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("John W. Smith")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /review → approve → explore in action/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /see review → approve → query in action/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /evaluator guide/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /acme-office-supply-invoice\.pdf/i })).toBeInTheDocument();
  });

  it("expands the walkthrough from the banner", async () => {
    mockDocumentList();
    renderWithProviders(<DocumentsPage />, { route: "/documents", path: "*" });

    expect(await screen.findByText("Acme Office Supply Co.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /see review → approve → query in action/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /start walkthrough/i }));
    expect(screen.getByRole("heading", { name: /review → approve → explore in action/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /see review → approve → query in action/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /evaluator guide/i })).toBeInTheDocument();
  });

  it("reopens the walkthrough from the header after dismiss", async () => {
    localStorage.setItem(DEMO_WALKTHROUGH_STORAGE_KEY, "1");
    mockDocumentList();
    renderWithProviders(<DocumentsPage />, { route: "/documents", path: "*" });

    expect(await screen.findByText("Acme Office Supply Co.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /review → approve → explore in action/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /evaluator guide/i }));
    expect(screen.getByRole("heading", { name: /review → approve → explore in action/i })).toBeInTheDocument();
  });

  it("shows a contextual extraction retry for partial documents", async () => {
    server.use(
      http.get("*/api/review-queue", () => HttpResponse.json(makeReviewQueueResponse())),
      http.get("*/api/documents", () =>
        HttpResponse.json(
          makeDocumentListResponse({
            items: [makeDocumentSummary({ processingStatus: "partial", processingPhase: null })],
          }),
        ),
      ),
    );
    renderWithProviders(<DocumentsPage />, { route: "/documents", path: "*" });

    const retry = await screen.findByRole("button", { name: /retry partial extraction/i });
    expect(retry).toHaveTextContent("Retry");
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
