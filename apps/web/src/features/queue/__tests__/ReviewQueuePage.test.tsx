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

    // Human summary of the outstanding work.
    expect(await screen.findByText(/3 open issues across 1 document/i)).toBeInTheDocument();

    // The top issue's action-oriented message is shown.
    const row = (await screen.findByText("Northstar Logistics")).closest("li")!;
    expect(within(row).getByText(/choose the correct one/i)).toBeInTheDocument();
    // Remaining issues beyond the top one are surfaced as a count.
    expect(within(row).getByText(/\+2 more issues/i)).toBeInTheDocument();

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
  });

  it("shows an all-clear state when nothing needs review", async () => {
    server.use(
      http.get("*/api/review-queue", () =>
        HttpResponse.json(makeReviewQueueResponse({ items: [], totalDocuments: 0, totalOpenIssues: 0 })),
      ),
    );

    renderWithProviders(<ReviewQueuePage />, { route: "/review-queue", path: "*" });
    expect(await screen.findByText(/You're all caught up/i)).toBeInTheDocument();
    expect(screen.getByText(/every document is verified/i)).toBeInTheDocument();
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
