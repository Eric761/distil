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
    history: (id: string) => ["documents", "history", id] as const,
    parse: (id: string) => ["documents", "parse", id] as const,
    samples: ["documents", "samples"] as const,
  },
  records: {
    search: (filters: QueryFilters, page: number, sort: string, direction: string, text?: string, trustScope?: string) =>
      ["records", "search", { filters, page, sort, direction, text: text ?? null, trustScope: trustScope ?? "approved" }] as const,
  },
  reviewQueue: ["review-queue"] as const,
  schemas: {
    all: ["schemas"] as const,
    version: (versionId: string) => ["schemas", "version", versionId] as const,
  },
};
