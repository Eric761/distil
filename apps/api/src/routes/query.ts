import type { FastifyInstance } from "fastify";
import {
  queryRequest,
  type QueryFilters,
  type QueryInterpretation,
  type QueryResponse,
} from "@invoice/contracts";
import { buildChips, interpretQuery } from "../services/query-interpreter.js";
import { getKnownVendors, runFilters } from "../services/record-query.js";

export async function queryRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/query", async (request) => {
    const body = queryRequest.parse(request.body ?? {});

    const knownVendors = await getKnownVendors();
    const interpreted = interpretQuery(body.text, knownVendors);

    // Explicit filters (edited chips) are authoritative when provided.
    const effectiveFilters: QueryFilters = body.filters ?? interpreted.filters;
    const hasFilters = Object.keys(effectiveFilters).length > 0;
    const needsClarification = !hasFilters && Boolean(body.text);

    const interpretation: QueryInterpretation = {
      originalText: interpreted.originalText,
      filters: effectiveFilters,
      chips: buildChips(effectiveFilters),
      unparsedTerms: interpreted.unparsedTerms,
      warnings: interpreted.warnings,
      needsClarification,
    };

    if (needsClarification) {
      const response: QueryResponse = {
        interpretation,
        items: [],
        pagination: { page: body.page, pageSize: body.pageSize, total: 0, totalPages: 1 },
        summary: { totalCount: 0, byCurrency: [] },
      };
      return response;
    }

    const { items, total, summary } = await runFilters({ ...body, filters: effectiveFilters });
    const response: QueryResponse = {
      interpretation,
      items,
      pagination: {
        page: body.page,
        pageSize: body.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / body.pageSize)),
      },
      summary,
    };
    return response;
  });
}
