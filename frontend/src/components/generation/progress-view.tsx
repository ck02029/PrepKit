"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { cancelGeneration, retryKit } from "@/lib/api";
import type { GenerationStatus } from "@/lib/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { generationProgressPercent, generationViewState } from "@/lib/generation-view-state";

const stateIcon = { pending: "○", running: "◌", done: "✓", warning: "!", failed: "×" };
const generationOrder = ["research", "requirements", "overview", "topics", "rounds", "questions", "flashcards", "schedule"];
const generationLabels: Record<string, string> = {
  research: "Search interview reports and company site",
  requirements: "Analyze the role requirements",
  overview: "Build the company and role overview",
  topics: "Build the role topic map",
  rounds: "Summarize interview rounds",
  questions: "Generate tailored practice questions",
  flashcards: "Create study flashcards",
  schedule: "Build the practice schedule",
};

export function ProgressView({ kitId, status }: { kitId: string; status: GenerationStatus }) {
  const queryClient = useQueryClient();
  const percent = generationProgressPercent(status.steps);
  const skipped = status.sources.some((source) => source.state === "skipped");
  const viewState = generationViewState(status, false);
  const orderedSteps = [...status.steps].sort((a, b) => generationOrder.indexOf(a.name) - generationOrder.indexOf(b.name));

  if (viewState === "ready") {
    return <ReadyRedirect kitId={kitId} />;
  }
  if (viewState === "failed") return <section className="border border-red-200 bg-red-50 p-5"><h2 className="font-semibold">Generation failed</h2><p className="mt-1 text-sm">Your input is saved. Try generating again.</p><Button className="mt-4" onClick={() => { void retryKit(kitId).then(() => Promise.all([queryClient.invalidateQueries({ queryKey: ["generation", kitId] }),queryClient.invalidateQueries({ queryKey: ["kit", kitId] })])); }}>Try again</Button></section>;

  return <section aria-label="Kit generation" className="max-w-2xl">
    <h1 className="text-2xl font-semibold">Generation preview</h1>
    <p className="mt-2 border-l-4 border-[#c48a28] bg-[#fff7e7] px-4 py-3 text-sm">{viewState === "warning" && status.status === "waiting_for_quota" ? status.message ?? "AI providers are rate-limited. Your saved progress will resume automatically." : status.status === "needs_review" ? "Generation finished, but required practice coverage or schedule allocation is incomplete. Review the warnings before using this kit." : viewState === "warning" && status.status === "ready" ? "Generation finished. Some sections used fallback content; your kit is ready to review." : "PrepKit searches public interview reports first, then uses your role and job description to build sourced topics, rounds, practice questions, and a schedule. You can leave this page and return while it runs."}{viewState === "warning" && status.status === "waiting_for_quota" && status.retryAt ? <span className="mt-1 block">Next automatic attempt: {new Date(status.retryAt).toLocaleString()}.</span> : null}</p>
    <div className="mt-5" role="progressbar" aria-label="Generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="h-2 overflow-hidden rounded-full bg-[#e4e8e4]"><div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} /></div>
      <p className="mt-2 text-right font-mono text-xs text-muted">{percent}%</p>
    </div>
    <ol aria-live="polite" className="mt-5 divide-y divide-border border-y border-border">
      {orderedSteps.map((step) => <li key={step.name} className="flex items-start gap-3 py-3"><span className="w-5 text-center font-semibold" aria-hidden>{stateIcon[step.state]}</span><div><p className="text-sm font-medium">{generationLabels[step.name] ?? step.name}</p><p className="text-sm text-muted">{step.detail}</p></div></li>)}
    </ol>
    <div className="mt-5"><h2 className="text-sm font-semibold">Research sources</h2>{status.sources.length ? <ul className="mt-2 space-y-2 text-sm">{status.sources.map((source) => <li key={source.url} className="flex gap-2"><span aria-hidden>{source.state === "read" ? "✓" : "↷"}</span><span><strong>{source.url}</strong> · {source.state === "read" ? "Read" : `Unavailable: ${source.reason}`}</span></li>)}</ul> : <p className="mt-1 text-sm text-muted">Research sources will appear here as they are processed.</p>}</div>
    {skipped ? <p className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">Some research sources could not be reached. Your kit will still be ready to use.</p> : null}
    {status.status === "cancelled" ? <p className="mt-4 text-sm text-muted">Generation cancelled. Your input is saved.</p> : null}
    <div className="mt-5 flex gap-2">{status.status === "ready" || status.status === "needs_review" ? <LinkButton href={`/kits/${kitId}`} variant="primary">{status.status === "needs_review" ? "Review kit" : "Open kit"}</LinkButton> : <Button variant="secondary" onClick={() => { void cancelGeneration(kitId); void queryClient.invalidateQueries({ queryKey: ["generation", kitId] }); }}>Cancel</Button>}<LinkButton href="/kits" variant="ghost">My kits</LinkButton></div>
  </section>;
}

function ReadyRedirect({ kitId }: { kitId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["kits"] });
    void queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
    router.refresh();
    router.replace(`/kits/${kitId}`);
  }, [kitId, queryClient, router]);
  return <p className="text-sm text-muted" role="status">Your kit is ready…</p>;
}
