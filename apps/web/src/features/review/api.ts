import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  extractionDetail,
  type ApproveRequest,
  type ExtractionDetail,
  type SaveExtractionRequest,
} from "@invoice/contracts";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function useExtraction(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.documents.extraction(id),
    queryFn: ({ signal }) =>
      apiRequest<ExtractionDetail>(`/documents/${id}/extraction`, { schema: extractionDetail, signal }),
    enabled,
    staleTime: 5_000,
    // Do not refetch on focus: it would clobber an in-progress review draft.
    refetchOnWindowFocus: false,
  });
}

export function useSaveExtraction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveExtractionRequest) =>
      apiRequest<ExtractionDetail>(`/documents/${id}/extraction`, {
        method: "PATCH",
        body,
        schema: extractionDetail,
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.documents.extraction(id), data);
      void qc.invalidateQueries({ queryKey: queryKeys.documents.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

export function useApprove(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApproveRequest) =>
      apiRequest<ExtractionDetail>(`/documents/${id}/approve`, {
        method: "POST",
        body,
        schema: extractionDetail,
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.documents.extraction(id), data);
      void qc.invalidateQueries({ queryKey: queryKeys.documents.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.documents.all });
      void qc.invalidateQueries({ queryKey: ["records"] });
    },
  });
}
