import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { DOC_ID, makeDocumentSummary } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { UploadDialog } from "../UploadDialog";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

describe("UploadDialog", () => {
  it("rejects non-PDF files before upload starts", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <UploadDialog>
        <button type="button">Upload</button>
      </UploadDialog>,
      { route: "/", path: "*" },
    );

    await user.click(screen.getByRole("button", { name: "Upload" }));
    const input = screen.getByLabelText(/choose a pdf file/i) as HTMLInputElement;
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("Only PDF files are supported.")).toBeInTheDocument();
  });

  it("surfaces duplicate uploads with a link to the existing record", async () => {
    server.use(
      http.post("*/api/documents", () =>
        HttpResponse.json(
          {
            code: "DUPLICATE_DOCUMENT",
            title: "Already uploaded",
            detail: "This exact document was already uploaded. Open the existing record instead.",
            status: 409,
            meta: { document: makeDocumentSummary() },
          },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <UploadDialog>
        <button type="button">Upload</button>
      </UploadDialog>,
      { route: "/", path: "*" },
    );

    await user.click(screen.getByRole("button", { name: "Upload" }));
    const input = screen.getByLabelText(/choose a pdf file/i);
    const file = new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" });
    await user.upload(input, file);

    expect(await screen.findByText(/already uploaded/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open existing record/i }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(`/documents/${DOC_ID}/review`);
    });
  });
});
