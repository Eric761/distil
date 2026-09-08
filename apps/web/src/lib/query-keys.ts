import type { DocumentListQuery, QueryFilters } from "@invoice/contracts";

/**
 * Central query-key factory. Canonical params/filters are the cache identity,
 * so URL state and cache stay aligned and reproducible.
 */
export const queryKeys = {
  documents: {
    all: ["documents"] as const,
    list: (params: Partial<DocumentListQuery>) => ["documents", "list", params] as const,
    detail: (id: string) => ["documents", "detail", id] as const,
    extraction: (id: string) => ["documents", "extraction", id] as const,
    samples: ["documents", "samples"] as const,
  },
  records: {
    search: (filters: QueryFilters, page: number, sort: string, direction: string, text?: string) =>
      ["records", "search", { filters, page, sort, direction, text: text ?? null }] as const,
  },
  reviewQueue: ["review-queue"] as const,
};
