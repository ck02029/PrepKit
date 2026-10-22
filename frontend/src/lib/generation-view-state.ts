import type { GenerationStatus } from "@/lib/schema";

export type GenerationViewState = "skeleton" | "loading" | "partial" | "warning" | "failed" | "ready" | "cancelled";

export function generationProgressPercent(steps: Array<{ state: "pending" | "running" | "done" | "warning" | "failed" }>): number {
  if (!steps.length) return 0;
  const finished = steps.filter((step) => step.state === "done" || step.state === "warning" || step.state === "failed").length;
  return Math.round((finished / steps.length) * 100);
}

export function generationViewState(status: GenerationStatus | undefined, isLoading: boolean): GenerationViewState {
  if (!status) return isLoading ? "skeleton" : "failed";
  // A completed kit must open even when one or more sections need review.
  // Those warnings belong inside the kit; leaving the user on the preview
  // makes a completed, degraded kit look like it is still generating.
  if (status.status === "ready" || status.status === "needs_review") return "ready";
  if (status.status === "failed") return "failed";
  if (status.status === "cancelled") return "cancelled";
  if (status.status === "waiting_for_quota" || status.steps.some((step) => step.state === "warning" || step.state === "failed")) return "warning";
  return status.steps.some((step) => step.state === "done") ? "partial" : "loading";
}
