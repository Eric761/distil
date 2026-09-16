import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { makeReviewQueueItem, makeReviewQueueResponse, DOC_ID } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { ReviewQueuePage } from "../ReviewQueuePage";

describe("ReviewQueuePage", () => {
  it("summarizes open work and deep-links each row to the exact field to fix", async () => {
    server.use(
      http.get("*/api/review-queue", () => HttpResponse.json(makeReviewQueueResponse())),
    );

    renderWithProviders(<ReviewQueuePage />, { route: "/review-queue", path: "*" });

    const summary = await screen.findByLabelText(/review queue summary/i);
    expect(screen.getByText(/prioritize open issues/i)).toBeInTheDocument();
    expect(within(summary).getByText("Open issues")).toBeInTheDocument();
    expect(within(summary).getByText("Documents affected")).toBeInTheDocument();
    expect(within(summary).getByText(/Northstar Logistics · Total/i)).toBeInTheDocument();
    expect(within(summary).getByText("Blocking approval")).toBeInTheDocument();

    // The top issue's action-oriented message is shown.
    const row = (await screen.findByText("Northstar Logistics")).closest("li")!;
    expect(within(row).getByText("Blocking approval")).toBeInTheDocument();
    expect(within(row).getByText("Field")).toBeInTheDocument();
    expect(within(row).getByText("Checks")).toBeInTheDocument();
    expect(within(row).getByText("Status")).toBeInTheDocument();
    expect(within(row).getByText(/choose the correct one/i)).toBeInTheDocument();
    // Remaining issues are summarized once, without an ambiguous secondary count.
    expect(within(row).getByText(/3 open issues/i)).toBeInTheDocument();

    // Deep link targets the specific field via focusField and marks its origin.
    const link = within(row).getByRole("link", { name: /review/i });
    expect(link.getAttribute("href")).toContain(`/documents/${DOC_ID}/review`);
    expect(link.getAttribute("href")).toContain("from=queue");
    expect(link.getAttribute("href")).toContain("focusField=total");
  });

  it("ranks the most consequential issue first for 'Review next issue'", async () => {
    const urgent = makeReviewQueueItem({
      documentId: "aaaaaaaa-1111-4111-8111-111111111111",
      vendorName: "Urgent Vendor",
      topIssue: {
        fieldPath: "invoiceNumber",
        label: "Invoice number",
        confidenceState: "missing",
        validationState: "invalid",
        required: true,
        material: false,
        message: "Invoice number is required but was not found.",
      },
    });
    server.use(
      http.get("*/api/review-queue", () =>
        HttpResponse.json(makeReviewQueueResponse({ items: [urgent, makeReviewQueueItem()] })),
      ),
    );

    renderWithProviders(<ReviewQueuePage />, { route: "/review-queue", path: "*" });

    const nextButton = await screen.findByRole("button", { name: /review next issue/i });
    expect(nextButton).toBeInTheDocument();
    expect(await screen.findByText("Urgent Vendor")).toBeInTheDocument();
    expect(screen.getByText(/Urgent Vendor · Invoice number/i)).toBeInTheDocument();
  });

  it("shows an all-clear state when nothing needs review", async () => {
    server.use(
      http.get("*/api/review-queue", () =>
        HttpResponse.json(makeReviewQueueResponse({ items: [], totalDocuments: 0, totalOpenIssues: 0 })),
      ),
    );

    renderWithProviders(<ReviewQueuePage />, { route: "/review-queue", path: "*" });
    expect(await screen.findByText(/You're all caught up/i)).toBeInTheDocument();
    expect(screen.getByText(/no open review issues right now/i)).toBeInTheDocument();
  });

  it("offers a retry when the queue fails to load", async () => {
    server.use(
      http.get("*/api/review-queue", () =>
        HttpResponse.json(
          { code: "INTERNAL", title: "Boom", detail: "Server error", status: 500 },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<ReviewQueuePage />, { route: "/review-queue", path: "*" });
    expect(await screen.findByText(/Could not load the review queue/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
