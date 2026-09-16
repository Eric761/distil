import { describe, expect, it } from "vitest";
import { validateUploadFile } from "../upload-validation";

describe("validateUploadFile", () => {
  it("accepts PDF files within the size limit", () => {
    const file = new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" });
    expect(validateUploadFile(file)).toBeNull();
  });

  it("accepts text, Markdown, CSV, and HTML files", () => {
    for (const [name, type] of [
      ["notes.txt", "text/plain"],
      ["readme.md", "text/markdown"],
      ["rows.csv", "text/csv"],
      ["page.html", "text/html"],
    ] as const) {
      expect(validateUploadFile(new File(["hello"], name, { type }))).toBeNull();
    }
  });

  it("rejects unsupported file types", () => {
    const file = new File(["MZ"], "app.exe", { type: "application/x-msdownload" });
    expect(validateUploadFile(file)).toBe(
      "Unsupported file type. Upload a PDF, Text, Markdown, CSV, or HTML file.",
    );
  });

  it("rejects files larger than 5 MB", () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    expect(validateUploadFile(file)).toBe("File exceeds the 5 MB limit.");
  });
});
