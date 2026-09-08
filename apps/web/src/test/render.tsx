import * as React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AnnouncerProvider } from "@/components/live-region";

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface Options {
  route?: string;
  path?: string;
}

/**
 * Renders a component inside a data router + query + announcer providers.
 * A data router (createMemoryRouter) is used so components relying on data-router
 * hooks (e.g. useBlocker for the unsaved-changes guard) work under test.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  { route = "/", path = "*" }: Options = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = makeTestQueryClient();
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [route] });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <RouterProvider router={router} />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
