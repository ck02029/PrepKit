"use client";

import { fetchGenerationStatus } from "@/lib/api";
import type { GenerationStatus } from "@/lib/schema";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";

export function useGeneration(kitId: string, enabled = true) {
  return useQuery<GenerationStatus>({
    queryKey: queryKeys.generation(kitId),
    queryFn: () => fetchGenerationStatus(kitId),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "ready" || status === "needs_review" || status === "failed" || status === "cancelled") return false;
      if (status === "waiting_for_quota") return 60000;
      const attempts = query.state.dataUpdateCount;
      return Math.min(1000 * 2 ** Math.min(attempts, 4), 15000);
    },
    refetchIntervalInBackground: true,
  });
}
