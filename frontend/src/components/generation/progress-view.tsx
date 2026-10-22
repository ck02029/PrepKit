"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { cancelGeneration, retryKit } from "@/lib/api";
import type { GenerationStatus } from "@/lib/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { generationProgressPercent, generationViewState, nonDecreasingProgress } from "@/lib/generation-view-state";

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
const warmups = [
  {
    title: "Shape a strong example",
    prompt: "Think of a difficult problem you solved. Note the situation, what you did, and the result in three short bullets.",
    cue: "A clear story is easier to adapt to different behavioral questions.",
  },
  {
    title: "Explain a technical decision",
    prompt: "Pick a technical choice you made. What options did you consider, and what trade-off led you to your decision?",
    cue: "Practice explaining your reasoning before jumping to the answer.",
  },
  {
    title: "Talk through a tricky bug",
    prompt: "Recall a bug that took time to solve. What evidence helped you narrow down the cause, and how did you verify the fix?",
    cue: "A structured debugging story shows how you work under uncertainty.",
  },
];
function isSuppressed403(reason: string) {
  return /HTTP 403\b/i.test(reason);
}

function displayedStepDetail(name: string, detail: string) {
  if (name !== "research" || !detail) return detail;
  const visible = detail.split(";").map((part) => part.trim()).filter((part) => part && !isSuppressed403(part));
  return visible.join(" ") || (isSuppressed403(detail) ? "No accessible research sources were found. PrepKit continued with the available role information." : "");
}

export function ProgressView({ kitId, status }: { kitId: string; status: GenerationStatus }) {
  const queryClient = useQueryClient();
  const currentPercent = generationProgressPercent(status.steps);
  const [progressPeak, setProgressPeak] = useState({ kitId, percent: currentPercent });
  const previousPeak = progressPeak.kitId === kitId ? progressPeak.percent : 0;
  const percent = nonDecreasingProgress(previousPeak, currentPercent);
  useEffect(() => {
    setProgressPeak((previous) => previous.kitId === kitId
      ? { kitId, percent: nonDecreasingProgress(previous.percent, currentPercent) }
      : { kitId, percent: currentPercent });
  }, [kitId, currentPercent]);
  const visibleSources = status.sources.filter((source) => !(source.state === "skipped" && isSuppressed403(source.reason)));
  const skipped = visibleSources.some((source) => source.state === "skipped");
  const viewState = generationViewState(status, false);
  const orderedSteps = [...status.steps].sort((a, b) => generationOrder.indexOf(a.name) - generationOrder.indexOf(b.name));
  const [warmupIndex, setWarmupIndex] = useState(0);
  const activeStep = orderedSteps.find((step) => step.state === "running");
  const warmup = warmups[warmupIndex];

  if (viewState === "ready") {
    return <ReadyRedirect kitId={kitId} />;
  }
  if (viewState === "failed") return <section className="border border-red-200 bg-red-50 p-5"><h2 className="font-semibold">Generation failed</h2><p className="mt-1 text-sm">Your input is saved. Try generating again.</p><Button className="mt-4" onClick={() => { void retryKit(kitId).then(() => Promise.all([queryClient.invalidateQueries({ queryKey: ["generation", kitId] }),queryClient.invalidateQueries({ queryKey: ["kit", kitId] })])); }}>Try again</Button></section>;

  return <section aria-label="Kit generation" className="max-w-2xl">
    <h1 className="text-2xl font-semibold">Generation preview</h1>
    <p className="mt-2 border-l-4 border-[#c48a28] bg-[#fff7e7] px-4 py-3 text-sm">{viewState === "warning" && status.status === "waiting_for_quota" ? status.message ?? "AI providers are rate-limited. Your saved progress will resume automatically." : status.status === "needs_review" ? "Generation finished, but required practice coverage or schedule allocation is incomplete. Review the warnings before using this kit." : viewState === "warning" && status.status === "ready" ? "Generation finished. Some sections used fallback content; your kit is ready to review." : "PrepKit searches public interview reports first, then uses your role and job description to build sourced topics, rounds, practice questions, and a schedule. You can leave this page and return while it runs."}{viewState === "warning" && status.status === "waiting_for_quota" && status.retryAt ? <span className="mt-1 block">Next automatic attempt: {new Date(status.retryAt).toLocaleString()}.</span> : null}</p>
    {status.status === "generating" || status.status === "waiting_for_quota" ? <aside aria-label="While your kit is being prepared" className="mt-4 overflow-hidden rounded-2xl border border-[#d7e5df] bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-[#e7efeb] bg-[#f3f8f5] px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg text-[#23644f] shadow-sm" aria-hidden>{status.status === "waiting_for_quota" ? "↻" : "✦"}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">While we prepare your kit</h2>
          <p className="mt-0.5 text-xs text-muted">{status.status === "waiting_for_quota" ? "Your saved work is safe. The kit will continue automatically when an AI provider is available." : activeStep ? `In progress: ${generationLabels[activeStep.name] ?? activeStep.name}. You can leave this page and come back.` : "Your progress is saved as each section is completed. You can leave this page and come back."}</p>
        </div>
        <span className="hidden rounded-full border border-[#d7e5df] bg-white px-2.5 py-1 text-xs font-medium text-[#23644f] sm:inline-flex">Optional · 2 min</span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#23644f]">Quick interview warm-up</p>
            <h3 className="mt-1 text-base font-semibold text-ink">{warmup.title}</h3>
          </div>
          <button type="button" onClick={() => setWarmupIndex((index) => (index + 1) % warmups.length)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-[#f5f8f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Try another</button>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink">{warmup.prompt}</p>
        <p className="mt-2 text-xs text-muted">{warmup.cue}</p>
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted">These are general practice prompts, not predictions of this company’s interview rounds.</p>
      </div>
    </aside> : null}
    <div className="mt-5" role="progressbar" aria-label="Generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="h-2 overflow-hidden rounded-full bg-[#e4e8e4]"><div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} /></div>
      <p className="mt-2 text-right font-mono text-xs text-muted">{percent}%</p>
    </div>
    <ol aria-live="polite" className="mt-5 divide-y divide-border border-y border-border">
      {orderedSteps.map((step) => <li key={step.name} className="flex items-start gap-3 py-3"><span className="w-5 text-center font-semibold" aria-hidden>{stateIcon[step.state]}</span><div><p className="text-sm font-medium">{generationLabels[step.name] ?? step.name}</p>{displayedStepDetail(step.name, step.detail) ? <p className="text-sm text-muted">{displayedStepDetail(step.name, step.detail)}</p> : null}</div></li>)}
    </ol>
    <div className="mt-5"><h2 className="text-sm font-semibold">Research sources</h2>{visibleSources.length ? <ul className="mt-2 space-y-2 text-sm">{visibleSources.map((source, index) => <li key={`${source.url}-${index}`} className="flex gap-2"><span aria-hidden>{source.state === "read" ? "✓" : "↷"}</span><span><strong>{source.url}</strong> · {source.state === "read" ? "Read" : `Unavailable: ${source.reason}`}</span></li>)}</ul> : <p className="mt-1 text-sm text-muted">No source details to show.</p>}</div>
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
