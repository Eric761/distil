/** Failure taxonomy for parsing, mirrored by the API's error codes. */
export type ParseErrorCode =
  | "UNSUPPORTED_FILE"
  | "OCR_REQUIRED"
  | "PARSE_FAILED"
  | "EMPTY_DOCUMENT";

export class ParseError extends Error {
  readonly code: ParseErrorCode;
  constructor(code: ParseErrorCode, message: string) {
    super(message);
    this.name = "ParseError";
    this.code = code;
  }
}
