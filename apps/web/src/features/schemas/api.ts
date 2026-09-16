import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  schemaListResponse,
  schemaVersionDetail,
  type SchemaFieldDef,
  type SchemaListResponse,
  type SchemaVersionDetail,
} from "@invoice/contracts";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The lightweight schema library: families and their draft/published versions. */
export function useSchemas() {
  return useQuery({
    queryKey: queryKeys.schemas.all,
    queryFn: ({ signal }) =>
      apiRequest<SchemaListResponse>(`/schemas`, { schema: schemaListResponse, signal }),
    staleTime: 15_000,
  });
}

/** Full field definition of a single schema version. */
export function useSchemaVersion(versionId: string | null) {
  return useQuery({
    queryKey: versionId ? queryKeys.schemas.version(versionId) : ["schemas", "version", "none"],
    queryFn: ({ signal }) =>
      apiRequest<SchemaVersionDetail>(`/schemas/versions/${versionId}`, {
        schema: schemaVersionDetail,
        signal,
      }),
    enabled: versionId !== null,
    staleTime: 15_000,
  });
}

/** Edit a draft version's field definitions. Published versions are immutable. */
export function useUpdateDraft(versionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: SchemaFieldDef[]) =>
      apiRequest<SchemaVersionDetail>(`/schemas/versions/${versionId}`, {
        method: "PATCH",
        body: { fields },
        schema: schemaVersionDetail,
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.schemas.version(versionId), data);
      void qc.invalidateQueries({ queryKey: queryKeys.schemas.all });
    },
  });
}

/** Freeze a draft as an immutable published version. */
export function usePublishSchema(versionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<SchemaVersionDetail>(`/schemas/versions/${versionId}/publish`, {
        method: "POST",
        schema: schemaVersionDetail,
      }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.schemas.version(versionId), data);
      void qc.invalidateQueries({ queryKey: queryKeys.schemas.all });
    },
  });
}
