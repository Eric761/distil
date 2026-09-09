import { z } from "zod";
import { problemDetail, type ProblemDetail } from "@invoice/contracts";

const API_BASE = "/api";

/** Error thrown for any non-2xx API response, carrying the parsed problem. */
export class ApiError extends Error {
  readonly problem: ProblemDetail;
  constructor(problem: ProblemDetail) {
    super(problem.detail);
    this.name = "ApiError";
    this.problem = problem;
  }
  get code(): string {
    return this.problem.code;
  }
  get status(): number {
    return this.problem.status;
  }
}

/** Thrown when a network request fails before a response (offline/timeout). */
export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}

async function parseProblem(response: Response): Promise<ProblemDetail> {
  try {
    const json = await response.json();
    const parsed = problemDetail.safeParse(json);
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  return {
    code: "INTERNAL",
    title: "Request failed",
    detail: `The server responded with ${response.status}.`,
    status: response.status,
  };
}

interface RequestOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const { method = "GET", body, schema, signal } = options;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new NetworkError();
  }

  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }

  const json = await response.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError({
      code: "INTERNAL",
      title: "Unexpected response",
      detail: "The server returned data in an unexpected shape.",
      status: 500,
    });
  }
  return parsed.data;
}

/**
 * Lightweight liveness check against the API's `/api/ping` endpoint. Resolves
 * true on a 200, false otherwise (including network errors). Never throws, so
 * callers can poll it in a loop while a spun-down host wakes up.
 */
export async function pingApi(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/ping`, {
      method: "GET",
      cache: "no-store",
      ...(signal ? { signal } : {}),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * Uploads a file via XHR so we can report progress and support cancellation.
 * Returns the parsed response, or throws ApiError/NetworkError.
 */
export function uploadFile<T>(
  path: string,
  file: File,
  schema: z.ZodType<T>,
  handlers: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);

    xhr.open("POST", `${API_BASE}${path}`);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && handlers.onProgress) {
        handlers.onProgress({ loaded: event.loaded, total: event.total });
      }
    };

    xhr.onload = () => {
      const status = xhr.status;
      const json = xhr.response;
      if (status >= 200 && status < 300) {
        const parsed = schema.safeParse(json);
        if (parsed.success) resolve(parsed.data);
        else reject(new ApiError({ code: "INTERNAL", title: "Unexpected response", detail: "Unexpected response shape.", status: 500 }));
        return;
      }
      const problem = problemDetail.safeParse(json);
      reject(new ApiError(problem.success ? problem.data : { code: "INTERNAL", title: "Upload failed", detail: `Server responded with ${status}.`, status }));
    };

    xhr.onerror = () => reject(new NetworkError("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    if (handlers.signal) {
      if (handlers.signal.aborted) {
        xhr.abort();
        return;
      }
      handlers.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}
