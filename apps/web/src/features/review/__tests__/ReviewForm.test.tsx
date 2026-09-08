import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { Link, RouterProvider, createMemoryRouter } from "react-router-dom";
import { makeTestQueryClient, renderWithProviders } from "@/test/render";
import { AnnouncerProvider } from "@/components/live-region";
import { makeDetail, makeField, DOC_ID } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { ProvenanceProvider } from "@/features/provenance/provenance-context";
import { ReviewForm } from "../ReviewForm";
import type { ExtractionDetail, ReviewStatus } from "@invoice/contracts";

function blockedDetail(): ExtractionDetail {
  const invoiceNumber = makeField({
    path: "invoiceNumber",
    label: "Invoice number",
    group: "identity",
    type: "string",
    required: true,
    material: true,
    extractedValue: null,
    effectiveValue: null,
    confidenceScore: null,
    confidenceState: "missing",
    validationState: "invalid",
    validationIssues: [{ severity: "error", message: "Invoice number is required." }],
    reviewState: "needs_review",
    needsAttention: true,
    sourceReferences: [],
  });
  const vendorName = makeField({
    path: "vendorName",
    label: "Vendor name",
    confidenceState: "medium",
    confidenceScore: 0.7,
    reviewState: "needs_review",
    needsAttention: true,
    extractedValue: "Acme Inc",
    effectiveValue: "Acme Inc",
  });
  return makeDetail({
    fields: [invoiceNumber, vendorName],
    lineItems: [],
    approvalBlockers: [{ fieldId: invoiceNumber.id, path: "invoiceNumber", message: "Invoice number is required." }],
    progress: { totalAttentionFields: 2, resolvedAttentionFields: 0 },
  });
}

function renderForm(detail: ExtractionDetail, reviewStatus: ReviewStatus = "needs_review") {
  return renderWithProviders(
    <ProvenanceProvider>
      <ReviewForm documentId={DOC_ID} detail={detail} reviewStatus={reviewStatus} />
    </ProvenanceProvider>,
    { route: `/documents/${DOC_ID}/review`, path: "*" },
  );
}

describe("ReviewForm", () => {
  it("blocks approval and lists the server blockers while showing issue position", () => {
    renderForm(blockedDetail());

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    // The message appears both in the blocker list and the field's validation
    // chip, so assert at least one occurrence.
    expect(screen.getAllByText("Invoice number is required.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Resolve before approving:/i)).toBeInTheDocument();
    // Issue navigator reports position out of the total open issues.
    expect(screen.getByRole("button", { name: /Next issue, 1 of 2/ })).toBeInTheDocument();
  });

  it("exposes unsaved state and preserves the originally extracted value after a correction", async () => {
    const user = userEvent.setup();
    renderForm(blockedDetail());

    const vendorRow = screen.getByText("Vendor name").closest("[data-field-id]") as HTMLElement;
    await user.click(within(vendorRow).getByRole("button", { name: /correct/i }));

    const input = within(vendorRow).getByLabelText("Vendor name");
    await user.clear(input);
    await user.type(input, "Acme Corp");
    await user.click(within(vendorRow).getByRole("button", { name: /save value/i }));

    // Unsaved indicator appears...
    expect(screen.getByText(/You have unsaved changes\./i)).toBeInTheDocument();
    // ...and the original extracted value remains visible as provenance.
    expect(within(vendorRow).getByText(/Originally extracted as/i)).toBeInTheDocument();
    expect(within(vendorRow).getByText(/Acme Corp/)).toBeInTheDocument();
  });

  it("rejects an invalid correction inline with an accessible error", async () => {
    const user = userEvent.setup();
    const detail = makeDetail({
      fields: [
        makeField({
          path: "total",
          label: "Total",
          group: "amounts",
          type: "decimal",
          material: true,
          extractedValue: "868.00",
          effectiveValue: "868.00",
          confidenceState: "medium",
          needsAttention: true,
          reviewState: "needs_review",
        }),
      ],
      lineItems: [],
    });
    renderForm(detail);

    const row = screen.getByText("Total").closest("[data-field-id]") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /correct/i }));
    const input = within(row).getByLabelText("Total");
    await user.clear(input);
    await user.type(input, "not-a-number");
    await user.click(within(row).getByRole("button", { name: /save value/i }));

    expect(await within(row).findByText("Enter a valid number.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("clears the unsaved indicator after a successful save", async () => {
    const user = userEvent.setup();
    server.use(
      http.patch("*/api/documents/:id/extraction", () =>
        HttpResponse.json(
          makeDetail({
            version: 2,
            fields: [makeField({ path: "vendorName", label: "Vendor name", reviewState: "confirmed", needsAttention: false })],
            lineItems: [],
            approvalBlockers: [],
            progress: { totalAttentionFields: 1, resolvedAttentionFields: 1 },
          }),
        ),
      ),
    );

    const detail = makeDetail({
      fields: [
        makeField({
          path: "vendorName",
          label: "Vendor name",
          confidenceState: "medium",
          needsAttention: true,
          reviewState: "needs_review",
          effectiveValue: "Acme Inc",
          extractedValue: "Acme Inc",
        }),
      ],
      lineItems: [],
      progress: { totalAttentionFields: 1, resolvedAttentionFields: 0 },
    });
    renderForm(detail);

    const row = screen.getByText("Vendor name").closest("[data-field-id]") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /confirm/i }));
    expect(screen.getByText(/You have unsaved changes\./i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() =>
      expect(screen.queryByText(/You have unsaved changes\./i)).not.toBeInTheDocument(),
    );
  });

  it("shows a clear progress label when no fields need review", () => {
    const detail = makeDetail({
      fields: [
        makeField({
          path: "vendorName",
          label: "Vendor name",
          reviewState: "auto_accepted",
          needsAttention: false,
          effectiveValue: "Acme Inc",
          extractedValue: "Acme Inc",
        }),
      ],
      lineItems: [],
      approvalBlockers: [],
      progress: { totalAttentionFields: 0, resolvedAttentionFields: 0 },
    });
    renderForm(detail, "ready");

    expect(screen.getByText("No review needed")).toBeInTheDocument();
    expect(screen.queryByText("0/0 resolved")).not.toBeInTheDocument();
    expect(screen.getByText(/All clear/i)).toBeInTheDocument();
  });

  it("blocks approval when a material field has a reconciliation warning", () => {
    const detail = makeDetail({
      fields: [
        makeField({
          path: "total",
          label: "Total",
          group: "amounts",
          type: "decimal",
          required: true,
          material: true,
          extractedValue: "200.00",
          effectiveValue: "200.00",
          confidenceState: "high",
          validationState: "warning",
          validationIssues: [
            { severity: "warning", message: "Subtotal + tax (110.00) does not equal the total (200.00)." },
          ],
          reviewState: "auto_accepted",
          needsAttention: true,
        }),
      ],
      lineItems: [],
      approvalBlockers: [
        {
          fieldId: "total-field",
          path: "total",
          message: "Subtotal + tax (110.00) does not equal the total (200.00).",
        },
      ],
      progress: { totalAttentionFields: 1, resolvedAttentionFields: 0 },
    });
    renderForm(detail, "needs_review");

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getAllByText(/does not equal the total/i).length).toBeGreaterThanOrEqual(1);
  });

  it("guards in-app navigation when there are unsaved changes", async () => {
    const user = userEvent.setup();
    const detail = makeDetail({
      fields: [
        makeField({
          path: "vendorName",
          label: "Vendor name",
          confidenceState: "medium",
          needsAttention: true,
          reviewState: "needs_review",
          extractedValue: "Acme Inc",
          effectiveValue: "Acme Inc",
        }),
      ],
      lineItems: [],
      progress: { totalAttentionFields: 1, resolvedAttentionFields: 0 },
    });

    // Two routes so we can actually attempt an in-app navigation.
    const router = createMemoryRouter(
      [
        {
          path: "/documents/:id/review",
          element: (
            <ProvenanceProvider>
              <Link to="/documents">Back to documents</Link>
              <ReviewForm documentId={DOC_ID} detail={detail} reviewStatus={"needs_review" as never} />
            </ProvenanceProvider>
          ),
        },
        { path: "/documents", element: <div>Documents landing</div> },
      ],
      { initialEntries: [`/documents/${DOC_ID}/review`] },
    );
    render(
      <QueryClientProvider client={makeTestQueryClient()}>
        <AnnouncerProvider>
          <RouterProvider router={router} />
        </AnnouncerProvider>
      </QueryClientProvider>,
    );

    // Make the form dirty.
    const row = screen.getByText("Vendor name").closest("[data-field-id]") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /confirm/i }));
    expect(screen.getByText(/You have unsaved changes\./i)).toBeInTheDocument();

    // Attempting to navigate away opens the guard dialog instead of leaving,
    // offering both an explicit "leave" and "stay" choice.
    await user.click(screen.getByRole("link", { name: /back to documents/i }));
    expect(await screen.findByText(/Leave without saving\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /leave without saving/i })).toBeInTheDocument();

    // Choosing "Stay" keeps us on the review page with edits intact (no navigation).
    await user.click(screen.getByRole("button", { name: /stay on this page/i }));
    expect(screen.queryByText("Documents landing")).not.toBeInTheDocument();
    expect(screen.getByText(/You have unsaved changes\./i)).toBeInTheDocument();
  });
});
