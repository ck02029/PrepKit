"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineEdit } from "@/components/kits/editable-content";
import { useAutosave } from "@/hooks/use-autosave";
import { loadKitData } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { regenerateKitSection } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { KitData } from "@/lib/schema";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const frequencyLabels = { most: "Most reported", moderate: "Moderately reported", least: "Least reported", unknown: "Frequency unavailable" } as const;
const frequencyOrder = { most: 0, moderate: 1, least: 2, unknown: 3 } as const;

function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
}

export function BuilderContent({ kitId }: { kitId: string }) {
  const [data, setData] = useState<KitData | null>(null);
  const [retryingCompanyResearch, setRetryingCompanyResearch] = useState(false);
  const [companyResearchRetryError, setCompanyResearchRetryError] = useState(false);
  const [refreshingInterviewResearch, setRefreshingInterviewResearch] = useState(false);
  const [interviewResearchRefreshError, setInterviewResearchRefreshError] = useState(false);
  const router = useRouter();
  const { state: saveState, save, retry, setVersion } = useAutosave(kitId);
  const kitDataQuery = useQuery({ queryKey: queryKeys.kitData(kitId), queryFn: () => loadKitData(kitId) });
  useEffect(() => {
    if (!kitDataQuery.data) return;
    setData(kitDataQuery.data.data);
    setVersion(kitDataQuery.data.version);
  }, [kitDataQuery.data, setVersion]);
  if (kitDataQuery.isError) return <ErrorState title="Kit data unavailable" message="PrepKit could not load this kit from the server. Try again when the API is available." onRetry={() => void kitDataQuery.refetch()} />;
  if (kitDataQuery.isPending || !data) return <div aria-busy="true" aria-label="Loading kit" className="space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>;
  const mustCount = data.role.requirements.filter((requirement) => requirement.priority === "must").length;
  const coverageCount = mustCount - data.coverage.uncovered_requirement_ids.length;
  const research = data.interview_research;
  const allTopics = research.topics.slice().sort((first, second) => frequencyOrder[first.frequency] - frequencyOrder[second.frequency]);
  const researchRoundCount = research.expected_round_count;
  const candidateRoundCount = data.round_progress.expected_round_count;
  const roundCount = researchRoundCount ?? candidateRoundCount;
  const overviewLines = [
    `${data.role.title}${data.role.seniority ? ` · ${data.role.seniority}` : ""}`,
  ];
  const displayedRounds = [...research.rounds].sort((first, second) => first.order - second.order);

  function update(next: KitData) { setData(next); save(next); }
  async function retryCompanyResearch() {
    setRetryingCompanyResearch(true);
    setCompanyResearchRetryError(false);
    try {
      await regenerateKitSection(kitId, "overview");
      router.push(`/kits/${kitId}?generating=1`);
    } catch {
      setRetryingCompanyResearch(false);
      setCompanyResearchRetryError(true);
    }
  }
  async function refreshInterviewResearch() {
    setRefreshingInterviewResearch(true);
    setInterviewResearchRefreshError(false);
    try {
      await regenerateKitSection(kitId, "rounds");
      router.push(`/kits/${kitId}?generating=1`);
    } catch {
      setRefreshingInterviewResearch(false);
      setInterviewResearchRefreshError(true);
    }
  }
  return <div className="builder-content mx-auto flex w-full max-w-6xl flex-col gap-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Interview preparation kit · {data.source.company} · {data.schedule.days_available} days</p><h1 className="mt-1 text-2xl font-semibold">{data.role.title}</h1><p className="mt-2 max-w-2xl text-sm text-muted">Start with the overview, then use the topic map and rounds to guide practice.</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent">{coverageCount} of {mustCount} must-haves covered</span><span className="text-xs text-muted" role="status" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved, retry" : saveState === "conflict" ? "This kit changed somewhere else" : "Saved just now"}</span>{saveState === "error" ? <button className="text-xs text-accent underline" onClick={() => void retry()}>Retry</button> : null}</div></div>
      <LinkButton href={`/kits/${kitId}/practice`} variant="primary">Start practice</LinkButton>
    </header>
    <nav aria-label="Kit sections" className="sticky top-0 z-10 -mx-4 flex justify-start gap-1 overflow-x-auto border-b border-border bg-page px-4 py-2 md:mx-0 md:justify-end md:rounded md:px-2"><a className="whitespace-nowrap px-3 py-2 text-sm" href="#overview">Overview</a><a className="whitespace-nowrap px-3 py-2 text-sm" href="#topics">Topics</a><a className="whitespace-nowrap px-3 py-2 text-sm" href="#rounds">Rounds</a><a className="whitespace-nowrap px-3 py-2 text-sm" href="#schedule">Schedule</a></nav>
    <section id="overview" className="scroll-mt-20 border-b border-border pb-6">
      <h2 className="text-xl font-semibold">Overview</h2>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        <div className="rounded border border-border bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Target role</p>
          <p className="mt-3 text-sm leading-7">{overviewLines.join(" ")}</p>
        </div>
        <div className="rounded border border-border bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">About {data.source.company}</p>
          <InlineEdit value={data.company_brief.summary || "No company overview available yet. Add a short summary."} multiline onCommit={(value) => update({ ...data, company_brief: { ...data.company_brief, summary: value, origin: data.company_brief.origin === "generated" ? "edited" : data.company_brief.origin, updatedAt: new Date().toISOString() } })} className="mt-3 block text-sm font-medium text-ink" />
          <InlineEdit value={data.company_brief.what_they_do || "No company details are available yet."} multiline onCommit={(value) => update({ ...data, company_brief: { ...data.company_brief, what_they_do: value, origin: data.company_brief.origin === "generated" ? "edited" : data.company_brief.origin, updatedAt: new Date().toISOString() } })} className="mt-2 block text-sm leading-6 text-muted" />
          {safeExternalUrl(data.source.company_url) ? <a className="mt-3 inline-block text-sm text-accent underline" href={safeExternalUrl(data.source.company_url)!} target="_blank" rel="noreferrer">Official company website ↗</a> : null}
        </div>
      </div>
      {data.source.web_research_skipped ? <p className="mt-4 rounded bg-[#fff7e7] px-4 py-3 text-sm text-ink">Web research was skipped for this kit. Turn research on when creating a new kit to search interview reports by company and role.</p> : data.source.pages_used.length === 0 ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded bg-[#fff7e7] px-4 py-3 text-sm text-ink"><p>{data.source.company_url ? "No official company website pages were retrieved. Interview-report research is shown separately under Rounds." : "PrepKit could not identify or retrieve an official company website from the company name. Interview-report research is shown separately under Rounds."}</p>{!data.source.company_url && data.company_brief.origin === "generated" ? <Button variant="secondary" disabled={retryingCompanyResearch} onClick={() => void retryCompanyResearch()}>{retryingCompanyResearch ? "Retrying research…" : "Retry company website search"}</Button> : null}{companyResearchRetryError ? <p role="alert" className="w-full text-red-800">Could not queue company research. Please try again.</p> : null}</div> : null}
    </section>
    <section id="topics" aria-labelledby="topic-overview-heading" className="scroll-mt-20 border-b border-border pb-6">
      <h2 id="topic-overview-heading" className="text-xl font-semibold">Topics</h2>
      <p className="mt-1 text-sm text-muted">Review the highlighted subtopics, then start a focused practice session for an area.</p>
      {allTopics.length ? <div className="mt-5">
        <h3 className="font-semibold">All topics</h3>
        <ul className="mt-2 divide-y divide-border border-y border-border">{allTopics.map((topic) => {
          const questionIds = data.questions.filter((question) => question.requirement_ids.some((id) => topic.requirement_ids.includes(id))).map((question) => question.id);
          return <li key={topic.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium">{topic.label}</h4><span className="rounded bg-page px-2 py-0.5 text-xs text-muted">{frequencyLabels[topic.frequency]}</span></div><p className="mt-1 text-sm text-muted">{topic.description}</p>{topic.subtopics?.length ? <ul className="mt-2 flex flex-wrap gap-2">{topic.subtopics.map((subtopic) => <li key={subtopic} className="rounded bg-accent-tint px-2 py-1 text-xs text-accent">{subtopic}</li>)}</ul> : null}<p className="mt-1 text-xs text-muted">{topic.sources.length} sources · {topic.confidence ? `${topic.confidence} confidence` : "confidence unavailable"}</p>{topic.sources.length ? <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">{topic.sources.map((source) => <li key={source.url}><a className="text-accent underline" href={source.url} target="_blank" rel="noreferrer">{source.publisher}</a></li>)}</ul> : null}</div>{questionIds.length ? <LinkButton href={`/kits/${kitId}/practice?questions=${questionIds.join(",")}`} variant="ghost" className="min-h-9 px-0">Practise related questions</LinkButton> : null}</li>;
        })}</ul>
      </div> : null}
    </section>
    <section id="rounds" className="scroll-mt-20 border-b border-border pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Rounds</h2><p className="mt-1 text-sm text-muted">Interview reports shape practice when found; otherwise these are role-and-level preparation patterns, not a confirmed company process.</p></div><span className="rounded border border-border px-2 py-1 text-xs text-muted">{research.research_scope === "company_specific" ? "Company interview reports" : research.research_scope === "role_level" ? "Role-level interview research" : "Role-based guidance"}</span></div>
      {research.research_scope === "company_specific" ? <p className="mt-3 text-sm">{roundCount ? `Company interview reports mention about ${roundCount} interview formats. The rounds may be combined or sequenced differently by role, level, location, and team.` : "Company interview information was found, but a round count was not confirmed."}</p> : research.research_scope === "role_level" ? <p className="mt-3 text-sm text-muted">Related role-level interview reports were found. They inform these practice areas but do not confirm this company’s process.</p> : <p className="mt-3 text-sm text-muted">No usable interview reports were found. These are role-based practice suggestions, not a confirmed company process.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={refreshingInterviewResearch} onClick={() => void refreshInterviewResearch()}>{refreshingInterviewResearch ? "Searching interview reports…" : "Refresh interview research"}</Button>{interviewResearchRefreshError ? <p className="text-sm text-red-700" role="alert">Interview research could not be refreshed. Try again when generation is idle.</p> : null}</div>
      {!data.questions.some((question) => question.source_type === "reported") ? <p className="mt-3 rounded bg-page px-4 py-3 text-sm text-muted">Practice prompts are generated from the job description and available interview research. They are not presented as verbatim company-reported questions.</p> : null}
      <ol className="mt-3 space-y-3">{displayedRounds.map((round) => {
        const completed = data.round_progress.completed_rounds.some((name) => name.trim().toLowerCase() === round.name.trim().toLowerCase());
        const preparing = data.round_progress.current_round.trim().toLowerCase() === round.name.trim().toLowerCase();
        const reportedQuestions = data.questions.filter((question) => question.source_type === "reported" && question.round_name?.trim().toLowerCase() === round.name.trim().toLowerCase());
        return <li key={round.id} className="rounded border border-border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{round.basis === "company_reports" ? `Reported format: ${round.name}` : `Round ${round.order}: ${round.name}`}</h3><span className="text-xs text-muted">{completed ? "Completed" : preparing ? "Preparing" : "Upcoming"}</span></div><p className="mt-2 text-sm text-muted">{round.description}</p><p className="mt-1 text-xs text-muted">{round.basis === "company_reports" ? "Based on company interview reports" : round.basis === "role_reports" ? "Based on reports for this role or level; not confirmed for this company" : "Role-based practice suggestion; not confirmed for this company"}</p>{round.expectations?.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{round.expectations.map((item) => <li key={item}>{item}</li>)}</ul> : null}{round.sources.length ? <><p className="mt-3 text-xs text-muted">{round.sources.length} sources · {round.confidence ? `${round.confidence} confidence` : "expectation confidence unavailable"}</p><ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">{round.sources.map((source) => <li key={source.url}><a className="text-accent underline" href={source.url} target="_blank" rel="noreferrer">{source.publisher}</a></li>)}</ul></> : null}{reportedQuestions.length ? <div className="mt-4 border-t border-border pt-3"><h4 className="text-sm font-semibold">Previously reported questions</h4><ul className="mt-2 space-y-3">{reportedQuestions.map((question) => <li key={question.id} className="text-sm"><p>{question.prompt}</p><p className="mt-1 text-xs text-muted">Anecdotal report · {question.report_count ?? "Report count unavailable"} reports · {question.reported_at ?? "Date unavailable"} · reliability {question.reliability ?? "unverified"}</p>{question.practice_type === "coding" && safeExternalUrl(question.source_url) ? <a className="mt-1 inline-block text-accent underline" href={safeExternalUrl(question.source_url)!} target="_blank" rel="noreferrer">Open coding problem{question.source_platform ? ` on ${question.source_platform}` : ""} ↗</a> : <LinkButton className="mt-1 min-h-9 px-0" variant="ghost" href={`/kits/${kitId}/practice?questions=${question.id}`}>Practise in PrepKit</LinkButton>}</li>)}</ul></div> : null}</li>;
      })}</ol>
      {data.round_progress.completed_rounds.length || data.round_progress.current_round ? <div className="mt-4"><h3 className="text-sm font-semibold">Your progress</h3>{data.round_progress.completed_rounds.length ? <p className="mt-1 text-sm">Completed: {data.round_progress.completed_rounds.join(", ")}</p> : null}{data.round_progress.current_round ? <p className="mt-1 text-sm">Preparing: {data.round_progress.current_round}</p> : null}</div> : <p className="mt-4 text-sm text-muted">You can update round progress after verifying the interview format.</p>}
    </section>


    <section id="schedule" className="scroll-mt-20 pb-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Your schedule</h2><LinkButton href={`/kits/${kitId}/schedule`} variant="ghost">Full schedule →</LinkButton></div><ul className={`mt-3 divide-y divide-border border-y border-border `}>{data.schedule.days.slice(0, 3).map((day) => <li key={day.day} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">Day {day.day}: {day.focus}</p><p className="mt-1 text-xs text-muted">{day.question_ids.length} questions</p></div><span className="font-mono text-sm">{day.minutes} min</span></li>)}</ul></section>

    {saveState === "conflict" ? <div role="alert" className="fixed bottom-4 right-4 z-30 max-w-sm border border-[#e8c99a] bg-[#fff7e7] p-4 shadow-card"><p className="text-sm font-medium">This kit changed somewhere else</p><p className="mt-1 text-xs text-muted">Your edits are still on this screen.</p><Button variant="secondary" className="mt-2" onClick={() => void retry()}>Try saving again</Button></div> : null}
  </div>;
}
