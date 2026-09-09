import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { makeDocumentListResponse, makeDocumentSummary } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { DemoWalkthroughPanel } from "../DemoWalkthroughPanel";

function mockStepLookups() {
  server.use(
    http.get("*/api/documents", ({ request }) => {
      const search = new URL(request.url).searchParams.get("search") ?? "doc";
      return HttpResponse.json(
        makeDocumentListResponse({
          items: [makeDocumentSummary({ vendorName: `${search} vendor` })],
        }),
      );
    }),
  );
}

function renderPanel(onDismiss = vi.fn()) {
  mockStepLookups();
  return renderWithProviders(<DemoWalkthroughPanel onDismiss={onDismiss} />, { route: "/documents", path: "*" });
}

describe("DemoWalkthroughPanel", () => {
  it("renders all five evaluator steps", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: /five steps: review → approve → query/i })).toBeInTheDocument();
    expect(screen.getByText("Greenline Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Query approved records")).toBeInTheDocument();
    expect(screen.getAllByText(/^Step \d$/)).toHaveLength(5);
  });

  it("calls onDismiss when closed", async () => {
    const onDismiss = vi.fn();
    renderPanel(onDismiss);
    await userEvent.click(screen.getByRole("button", { name: /close walkthrough/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
