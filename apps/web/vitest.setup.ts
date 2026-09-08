import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./src/test/msw-server";

// jsdom lacks a few DOM APIs that Radix UI primitives (e.g. Select) touch on
// render/interaction. Polyfill them so component tests don't throw.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });

  // Two jsdom/undici interop quirks are smoothed over here so MSW receives
  // exactly what production code sends, without changing that code:
  //
  //  1. Root-relative API paths (e.g. "/api/query") resolve against the origin
  //     in a browser, but Node's global fetch rejects relative URLs — so make
  //     them absolute.
  //  2. TanStack Query passes an AbortSignal created from jsdom's
  //     AbortController, which is a different class than the one Node's fetch
  //     validates against, causing it to throw before the request is made.
  //     Cancellation is irrelevant to these tests, so drop the signal.
  const patchedFetch = globalThis.fetch.bind(globalThis);
  const origin = globalThis.location?.origin ?? "http://localhost";
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let nextInit = init;
    if (init && "signal" in init) {
      nextInit = { ...init };
      delete (nextInit as { signal?: unknown }).signal;
    }
    if (typeof input === "string" && input.startsWith("/")) {
      return patchedFetch(`${origin}${input}`, nextInit);
    }
    return patchedFetch(input, nextInit);
  }) as typeof fetch;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
