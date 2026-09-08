import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  documentDetail,
  documentListResponse,
  processResponse,
  sampleListResponse,
  uploadResponse,
  type DocumentDetail,
  type DocumentListQuery,
  type DocumentListResponse,
  type ProcessResponse,
  type UploadResponse,
} from "@invoice/contracts";
import { apiRequest, uploadFile, type UploadProgress } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

function listParams(params: Partial<DocumentListQuery>): string {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("search", params.search);
  if (params.sort) sp.set("sort", params.sort);
  if (params.direction) sp.set("direction", params.direction);
  for (const s of params.processingStatus ?? []) sp.append("processingStatus", s);
  for (const s of params.reviewStatus ?? []) sp.append("reviewStatus", s);
  const q = sp.toString();
  return q ? `?${q}` : "";
}

const ACTIVE = new Set(["queued", "processing"]);

export function useDocumentList(params: Partial<DocumentListQuery>) {
  return useQuery({
    queryKey: queryKeys.documents.list(params),
    queryFn: ({ signal }) =>
      apiRequest<DocumentListResponse>(`/documents${listParams(params)}`, {
        schema: documentListResponse,
        signal,
      }),
    placeholderData: (prev) => prev,
    // Poll while anything is actively processing; stop once settled.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const active = data.activeProcessingCount > 0 || data.items.some((d) => ACTIVE.has(d.processingStatus));
      return active ? 1500 : false;
    },
    refetchIntervalInBackground: false,
  });
}

export function useSamples() {
  return useQuery({
    queryKey: queryKeys.documents.samples,
    queryFn: ({ signal }) => apiRequest(`/documents/samples`, { schema: sampleListResponse, signal }),
    staleTime: Infinity,
  });
}

export function useDocumentDetail(id: string, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.documents.detail(id),
    queryFn: ({ signal }) => apiRequest<DocumentDetail>(`/documents/${id}`, { schema: documentDetail, signal }),
    refetchInterval: (query) => {
      if (!options.poll) return false;
      const status = query.state.data?.summary.processingStatus;
      return status && ACTIVE.has(status) ? 1000 : false;
    },
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { file: File; onProgress?: (p: UploadProgress) => void; signal?: AbortSignal }) =>
      uploadFile<UploadResponse>(`/documents`, args.file, uploadResponse, {
        ...(args.onProgress ? { onProgress: args.onProgress } : {}),
        ...(args.signal ? { signal: args.signal } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

export function useIngestSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fixtureId: string) =>
      apiRequest<UploadResponse>(`/documents/samples/${fixtureId}`, { method: "POST", schema: uploadResponse }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

export function useProcessDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (retry: boolean) =>
      apiRequest<ProcessResponse>(`/documents/${id}/process`, {
        method: "POST",
        body: { retry },
        schema: processResponse,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.documents.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}
