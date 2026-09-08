import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { ERROR_CODES, type ErrorCode, type ProblemDetail } from "@invoice/contracts";

/** A domain error that maps cleanly to an RFC 9457 problem response. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly title: string;
  readonly fieldErrors?: Array<{ path: string; message: string }>;
  readonly meta?: Record<string, unknown>;

  constructor(args: {
    code: ErrorCode;
    status: number;
    title: string;
    detail: string;
    fieldErrors?: Array<{ path: string; message: string }>;
    meta?: Record<string, unknown>;
  }) {
    super(args.detail);
    this.name = "AppError";
    this.code = args.code;
    this.status = args.status;
    this.title = args.title;
    this.fieldErrors = args.fieldErrors;
    this.meta = args.meta;
  }
}

export const notFound = (detail: string): AppError =>
  new AppError({ code: ERROR_CODES.NOT_FOUND, status: 404, title: "Not found", detail });

export const badRequest = (detail: string, fieldErrors?: AppError["fieldErrors"]): AppError =>
  new AppError({
    code: ERROR_CODES.VALIDATION_FAILED,
    status: 400,
    title: "Invalid request",
    detail,
    ...(fieldErrors ? { fieldErrors } : {}),
  });

export function toProblem(error: unknown, requestId: string): { status: number; body: ProblemDetail } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        title: error.title,
        detail: error.message,
        status: error.status,
        requestId,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        ...(error.meta ? { meta: error.meta } : {}),
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        code: ERROR_CODES.VALIDATION_FAILED,
        title: "Invalid request",
        detail: "One or more values failed validation.",
        status: 400,
        requestId,
        fieldErrors: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    };
  }

  return {
    status: 500,
    body: {
      code: ERROR_CODES.INTERNAL,
      title: "Internal error",
      detail: "An unexpected error occurred. Your data has not been changed.",
      status: 500,
      requestId,
    },
  };
}

export function registerErrorHandler(request: FastifyRequest, reply: FastifyReply, error: unknown): void {
  const { status, body } = toProblem(error, request.id);
  if (status >= 500) {
    request.log.error({ err: error }, "request failed");
  }
  void reply.status(status).type("application/problem+json").send(body);
}
