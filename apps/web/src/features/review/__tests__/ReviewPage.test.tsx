import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { DOC_ID, EXTRACTION_ID, makeDetail, makeDocumentDetail } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { ReviewPage } from "../ReviewPage";

const NEW_EXTRACTION_ID = "55555555-5555-4555-8555-555555555555";

vi.mock("../SplitWorkspace", () => ({
  SplitWorkspace: ({ detail }: { detail: { extractionId: string } }) => (
    <div>Current extraction: {detail.extractionId}</div>
  ),
}));

describe("ReviewPage", () => {
  it("refreshes stale extraction data after re-extract promotes a new extraction", async () => {
    let extractionReads = 0;
    server.use(
      http.get("*/api/documents/:id", () =>
        HttpResponse.json(
          makeDocumentDetail({
            currentExtractionId: NEW_EXTRACTION_ID,
          }),
        ),
      ),
      http.get("*/api/documents/:id/extraction", () => {
        extractionReads += 1;
        return HttpResponse.json(
          makeDetail({
            extractionId: extractionReads === 1 ? EXTRACTION_ID : NEW_EXTRACTION_ID,
          }),
        );
      }),
    );

    renderWithProviders(<ReviewPage />, {
      route: `/documents/${DOC_ID}/review`,
      path: "/documents/:documentId/review",
    });

    await waitFor(() => {
      expect(screen.getByText(`Current extraction: ${NEW_EXTRACTION_ID}`)).toBeInTheDocument();
    });
    expect(extractionReads).toBeGreaterThanOrEqual(2);
  });
});
