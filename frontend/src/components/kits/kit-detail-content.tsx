"use client";

import { ProgressView } from "@/components/generation/progress-view";
import { BuilderContent } from "@/components/kits/builder-content";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkButton } from "@/components/ui/button";
import { useGeneration } from "@/hooks/use-generation";
import { fetchKit } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { generationViewState } from "@/lib/generation-view-state";
import { useQuery } from "@tanstack/react-query";

type KitDetailContentProps = { kitId: string; generating?: boolean };

export function KitDetailContent({ kitId, generating = false }: KitDetailContentProps) {
  const kitQuery = useQuery({ queryKey: queryKeys.kit(kitId), queryFn: () => fetchKit(kitId) });
  const shouldTrackGeneration = generating || kitQuery.data?.status === "generating" || kitQuery.data?.status === "failed";
  const generation = useGeneration(kitId, shouldTrackGeneration);
  const viewState = generationViewState(generation.data, kitQuery.isLoading || (shouldTrackGeneration && generation.isLoading));

  if (viewState === "skeleton") {
    return <div className="flex flex-col gap-6" aria-busy aria-label="Loading kit"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (kitQuery.isError) return <ErrorState onRetry={() => void kitQuery.refetch()} />;
  if (!kitQuery.data) return <EmptyState title="Kit not found" description="This kit may have been removed or the link is wrong." action={<LinkButton href="/kits" variant="secondary">Back to kits</LinkButton>} />;
  if (shouldTrackGeneration && generation.data && generation.data.status !== "ready" && generation.data.status !== "needs_review") return <ProgressView kitId={kitId} status={generation.data} />;
  return <BuilderContent kitId={kitId} />;
}
