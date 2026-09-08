export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Client-side upload validation shared by the dialog and tests. */
export function validateUploadFile(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Only PDF files are supported.";
  if (file.size > MAX_UPLOAD_BYTES) return "That file is larger than the 5 MB limit.";
  return null;
}
