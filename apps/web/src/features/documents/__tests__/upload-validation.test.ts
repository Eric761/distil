import { describe, expect, it } from "vitest";
import { validateUploadFile } from "../upload-validation";

describe("validateUploadFile", () => {
  it("accepts PDF files within the size limit", () => {
    const file = new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" });
    expect(validateUploadFile(file)).toBeNull();
  });

  it("rejects non-PDF files", () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    expect(validateUploadFile(file)).toBe("Only PDF files are supported.");
  });

  it("rejects files larger than 5 MB", () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    expect(validateUploadFile(file)).toBe("That file is larger than the 5 MB limit.");
  });
});
