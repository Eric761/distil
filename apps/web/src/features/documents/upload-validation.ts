export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Extensions the platform can parse into the canonical representation. */
const ALLOWED_EXTENSIONS = [
  "pdf",
  "txt",
  "text",
  "md",
  "markdown",
  "mdown",
  "csv",
  "tsv",
  "html",
  "htm",
];

/** MIME types the platform can parse (extension usually wins, this is a fallback). */
const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "text/html",
]);

export const UPLOAD_ACCEPT = ".pdf,.txt,.md,.markdown,.csv,.tsv,.html,.htm,application/pdf,text/plain,text/markdown,text/csv,text/html";

/** User-facing list of supported formats — keep casing aligned with DOCUMENT_FORMAT_LABELS. */
export const SUPPORTED_FORMATS_LABEL = "PDF, Text, Markdown, CSV, or HTML";

export const MAX_UPLOAD_SIZE_LABEL = "5 MB";

export const UNSUPPORTED_FILE_MESSAGE =
  `Unsupported file type. Upload a ${SUPPORTED_FORMATS_LABEL} file.`;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Client-side upload validation shared by the dialog and tests. */
export function validateUploadFile(file: File): string | null {
  const ext = extensionOf(file.name);
  const mime = file.type.toLowerCase().split(";")[0]?.trim() ?? "";
  const supported = ALLOWED_EXTENSIONS.includes(ext) || (mime !== "" && ALLOWED_MIME.has(mime));
  if (!supported) return UNSUPPORTED_FILE_MESSAGE;
  if (file.size > MAX_UPLOAD_BYTES) return `File exceeds the ${MAX_UPLOAD_SIZE_LABEL} limit.`;
  return null;
}
