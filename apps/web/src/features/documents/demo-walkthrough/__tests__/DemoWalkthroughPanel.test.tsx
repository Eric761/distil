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
  it("renders the evaluator journey and all guided examples", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: /review → approve → explore in action/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/evaluator guide flow/i)).toHaveTextContent(/review/i);
    expect(screen.getByLabelText(/evaluator guide flow/i)).toHaveTextContent(/approve/i);
    expect(screen.getByLabelText(/evaluator guide flow/i)).toHaveTextContent(/explore/i);
    expect(screen.getByText("Greenline Maintenance")).toBeInTheDocument();
    expect(screen.getByText("Project brief (Markdown)")).toBeInTheDocument();
    expect(screen.getByText("Explore document intelligence")).toBeInTheDocument();
    expect(screen.getByText(/choose any sample — order doesn't matter/i)).toBeInTheDocument();
  });

  it("calls onDismiss when closed", async () => {
    const onDismiss = vi.fn();
    renderPanel(onDismiss);
    await userEvent.click(screen.getByRole("button", { name: /close walkthrough/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
