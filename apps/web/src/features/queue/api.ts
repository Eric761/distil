import { useQuery } from "@tanstack/react-query";
import { reviewQueueResponse, type ReviewQueueResponse } from "@invoice/contracts";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * The cross-document review queue. Refetches on focus and on a gentle interval
 * so newly-processed documents surface without a manual reload, but pauses in
 * background tabs to avoid needless load.
 */
export function useReviewQueue() {
  return useQuery({
    queryKey: queryKeys.reviewQueue,
    queryFn: ({ signal }) =>
      apiRequest<ReviewQueueResponse>(`/review-queue`, { schema: reviewQueueResponse, signal }),
    placeholderData: (prev) => prev,
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}
