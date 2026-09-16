import { useQuery } from "@tanstack/react-query";
import {
  documentHistoryResponse,
  extractionDetail,
  queryResponse,
  type DocumentHistoryResponse,
  type ExtractionDetail,
  type QueryRequest,
  type QueryResponse,
} from "@invoice/contracts";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function useSearchRecords(request: QueryRequest, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.records.search(
      request.filters ?? {},
      request.page,
      request.sort,
      request.direction,
      request.text,
      request.trustScope,
    ),
    queryFn: ({ signal }) =>
      apiRequest<QueryResponse>(`/query`, { method: "POST", body: request, schema: queryResponse, signal }),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** Extraction detail for the Explore details drawer (Data / JSON tabs). */
export function useDocumentExtraction(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.documents.extraction(id) : ["documents", "extraction", "none"],
    queryFn: ({ signal }) =>
      apiRequest<ExtractionDetail>(`/documents/${id}/extraction`, { schema: extractionDetail, signal }),
    enabled: id !== null,
    staleTime: 5_000,
  });
}

/** Immutable document lineage for the Explore details drawer (History tab). */
export function useDocumentHistory(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.documents.history(id) : ["documents", "history", "none"],
    queryFn: ({ signal }) =>
      apiRequest<DocumentHistoryResponse>(`/documents/${id}/history`, {
        schema: documentHistoryResponse,
        signal,
      }),
    enabled: id !== null,
    staleTime: 5_000,
  });
}
