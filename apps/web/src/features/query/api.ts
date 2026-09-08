import { useQuery } from "@tanstack/react-query";
import { queryResponse, type QueryRequest, type QueryResponse } from "@invoice/contracts";
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
    ),
    queryFn: ({ signal }) =>
      apiRequest<QueryResponse>(`/query`, { method: "POST", body: request, schema: queryResponse, signal }),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}
