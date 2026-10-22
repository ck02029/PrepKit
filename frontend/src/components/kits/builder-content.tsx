"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineEdit } from "@/components/kits/editable-content";
import { useAutosave } from "@/hooks/use-autosave";
import { loadKitData } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { regenerateKitSection } from "@/lib/api";
import { topicHeading } from "@/lib/topic-heading";
import { useQuery } from "@tanstack/react-query";
import type { KitData } from "@/lib/schema";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function formatRole(value: string) {
  const cleaned = value.trim();
  if (/^sde\s*1$/i.test(cleaned)) return "SDE 1";
  if (/^sde\s*2$/i.test(cleaned)) return "SDE 2";
  if (/^entry-level$/i.test(cleaned)) return "Entry-level";
  return cleaned.replace(/\b\w+/g, (word) => word[0]!.toUpperCase() + word.slice(1));
}

function formatCompany(value: string) {
  if (/^microsoft$/i.test(value.trim())) return "Microsoft";
  return value.trim().replace(/\b\w+/g, (word) => word[0]!.toUpperCase() + word.slice(1));
}

function uniqueSources(sources: KitData["interview_research"]["topics"][number]["sources"]) {
  return [...new Map(sources.map((source) => [source.url, source])).values()];
}

function sourceLabel(source: KitData["interview_research"]["topics"][number]["sources"][number]) {
  if (source.title && source.title !== source.url) return `${source.publisher}: ${source.title}`;
  try {
    const slug = new URL(source.url).pathname.split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g, " ");
    return slug ? `${source.publisher}: ${slug}` : source.publisher;
  } catch { return source.publisher; }
}

function topicDescription(value: string) {
  return value.replace(/^Study for this reported or explicitly JD-stated interview format\.\s*/i, "");
}

function conciseRequirementText(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  const summaries: Array<[RegExp, string]> = [
    [/strong fundamental understanding of computer science/i, "Strong computer science fundamentals."],
    [/one or more areas of specialized knowledge/i, "Depth in one technical area plus broad engineering skills."],
    [/navigating and managing your work in new code bases/i, "Can navigate unfamiliar codebases and languages."],
    [/experience and familiarity with programming/i, "Programming experience through projects, coursework, or work."],
    [/clear written communication skills/i, "Clear written communication with teammates and stakeholders."],
    [/learn unfamiliar systems/i, "Can independently learn unfamiliar systems and seek guidance."],
    [/leverage ai tools/i, "Uses AI to speed development and carefully validates its output."],
    [/previous internships or other multi-person projects/i, "Team project experience, including giving and acting on feedback."],
    [/high quality pull requests/i, "Writes well-tested pull requests and delivers reliable work."],
    [/at least 1 year of university education/i, "One year of university study or equivalent experience."],
  ];
  const match = summaries.find(([pattern]) => pattern.test(text));
  if (match) return match[1];
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  if (firstSentence.length <= 78) return firstSentence.replace(/[.!?]+$/, "");
  const shortened = firstSentence.slice(0, 75).replace(/\s+\S*$/, "");
  return `${shortened}…`;
}

function sameRequirementText(first: string, second: string) {
  return normalizeStudyText(first) === normalizeStudyText(second);
}

function roundOnlyExpectations(round: KitData["interview_research"]["rounds"][number], topics: KitData["interview_research"]["topics"]) {
  const topicDetails = topics.flatMap((topic) => [topic.label, ...(topic.subtopics ?? [])]).map(normalizeStudyText).filter(Boolean);
  const seen = new Set<string>();
  return (round.expectations ?? []).filter((expectation) => {
    const normalized = normalizeStudyText(expectation);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return !topicDetails.some((detail) => normalized === detail || (Math.min(normalized.length, detail.length) >= 28 && (normalized.includes(detail) || detail.includes(normalized))));
  });
}

function normalizeStudyText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

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
  const [interviewResearchRefreshError, setInterviewResearchRefreshError] = useState("");
  const [refreshingTopics, setRefreshingTopics] = useState(false);
  const [topicRefreshError, setTopicRefreshError] = useState("");
  const [regeneratingQuestions, setRegeneratingQuestions] = useState(false);
  const [questionRegenerationError, setQuestionRegenerationError] = useState("");
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
  const allTopics = research.topics;
  const roundCount = research.job_description_interview_info?.expected_round_count ?? null;
  const overviewLines = [
    `${formatRole(data.role.title)}${data.role.seniority ? ` · ${formatRole(data.role.seniority)}` : ""}`,
  ];
  const displayedRounds = [...research.rounds].sort((first, second) => first.order - second.order);
  const roundOrder = new Map(displayedRounds.map((round, index) => [round.name, index]));
  const topicGroups = new Map<string, typeof allTopics>();
  [...allTopics].sort((first, second) => (roundOrder.get(first.round_name ?? "") ?? 999) - (roundOrder.get(second.round_name ?? "") ?? 999))
    .forEach((topic) => {
      const group = topic.round_name ?? "General preparation";
      topicGroups.set(group, [...(topicGroups.get(group) ?? []), topic]);
    });

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
    setInterviewResearchRefreshError("");
    try {
      await regenerateKitSection(kitId, "rounds");
      router.push(`/kits/${kitId}?generating=1`);
    } catch (error) {
      setRefreshingInterviewResearch(false);
      setInterviewResearchRefreshError(error instanceof Error ? error.message : "Interview research could not be refreshed.");
    }
  }
  async function refreshStudyTopics() {
    setRefreshingTopics(true);
    setTopicRefreshError("");
    try {
      await regenerateKitSection(kitId, "topics");
      router.push(`/kits/${kitId}?generating=1`);
    } catch (error) {
      setRefreshingTopics(false);
      setTopicRefreshError(error instanceof Error ? error.message : "Study topics could not be regenerated.");
    }
  }
  async function regenerateQuestions() {
    setRegeneratingQuestions(true);
    setQuestionRegenerationError("");
    try {
      await regenerateKitSection(kitId, "questions");
      router.push(`/kits/${kitId}?generating=1`);
    } catch (error) {
      setRegeneratingQuestions(false);
      setQuestionRegenerationError(error instanceof Error ? error.message : "Questions could not be regenerated.");
    }
  }
  return <div className="builder-content mx-auto flex w-full max-w-6xl flex-col gap-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Interview preparation kit · {formatCompany(data.source.company)} · {data.schedule.days_available} days</p><h1 className="mt-1 text-2xl font-semibold">{formatRole(data.role.title)}</h1><p className="mt-2 max-w-2xl text-sm text-muted">Start with the overview, then use the topic map and rounds to guide practice.</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent" title="Job description requirements are tracked separately from interview round research.">{coverageCount} of {mustCount} JD must-haves linked</span><span className="text-xs text-muted" role="status" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved, retry" : saveState === "conflict" ? "This kit changed somewhere else" : "Saved just now"}</span>{saveState === "error" ? <button className="text-xs text-accent underline" onClick={() => void retry()}>Retry</button> : null}</div></div>
      <div className="flex flex-wrap gap-2"><LinkButton href={`/kits/${kitId}/practice`} variant="primary">Start practice</LinkButton><Button variant="secondary" disabled={regeneratingQuestions} onClick={() => void regenerateQuestions()}>{regeneratingQuestions ? "Queueing regeneration…" : "Regenerate questions"}</Button></div>
      {questionRegenerationError ? <p className="w-full text-sm text-red-700" role="alert">{questionRegenerationError}</p> : null}
    </header>
    <nav aria-label="Kit sections" className="sticky top-0 z-10 -mx-4 flex justify-start gap-1 overflow-x-auto border-b border-border bg-page px-4 py-2 md:mx-0 md:justify-end md:rounded md:px-2"><a className="whitespace-nowrap px-3 py-2 text-sm" href="#overview">Overview</a><a className="whitespace-nowrap px-3 py-2 text-sm" href="#topics">Topics</a><a className="whitespace-nowrap px-3 py-2 text-sm" href="#rounds">Rounds</a><a className="whitespace-nowrap px-3 py-2 text-sm" href="#schedule">Schedule</a></nav>
    <section id="overview" className="scroll-mt-20 border-b border-border pb-6">
      <h2 className="text-xl font-semibold">Overview</h2>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        <div className="rounded border border-border bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Target role</p>
          <p className="mt-3 text-sm leading-7">{overviewLines.join(" ")}</p>
          <div className="mt-4 border-t border-border pt-4"><h3 className="text-sm font-semibold">Requirements</h3><p className="mt-1 text-xs text-muted">Key qualifications from the job description.</p>{data.role.requirements.length ? <ul className="mt-3 space-y-2">{data.role.requirements.map((requirement) => <li key={requirement.id} className="text-sm"><span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] ${requirement.priority === "must" ? "bg-[#fce9e6] text-[#8a1f14]" : "bg-nice-bg text-nice-text"}`}>{requirement.priority === "must" ? "Required" : "Preferred"}</span>{" "}<span title={requirement.text}>{conciseRequirementText(requirement.text)}</span>{requirement.evidence_quote && !sameRequirementText(requirement.evidence_quote, requirement.text) ? <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">View JD wording</summary><p className="mt-1">{requirement.evidence_quote}</p></details> : null}</li>)}</ul> : <p className="mt-3 text-sm text-muted">No explicit requirements were extracted. Add the job description to tailor this kit.</p>}</div>
        </div>
        <div className="rounded border border-border bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">About {formatCompany(data.source.company)}</p>
          <InlineEdit value={data.company_brief.summary || "No company overview available yet. Add a short summary."} multiline onCommit={(value) => update({ ...data, company_brief: { ...data.company_brief, summary: value, origin: data.company_brief.origin === "generated" ? "edited" : data.company_brief.origin, updatedAt: new Date().toISOString() } })} className="mt-3 block text-sm font-medium text-ink" />
          <InlineEdit value={data.company_brief.what_they_do || "No company details are available yet."} multiline onCommit={(value) => update({ ...data, company_brief: { ...data.company_brief, what_they_do: value, origin: data.company_brief.origin === "generated" ? "edited" : data.company_brief.origin, updatedAt: new Date().toISOString() } })} className="mt-2 block text-sm leading-6 text-muted" />
          {safeExternalUrl(data.source.company_url) ? <a className="mt-3 inline-block text-sm text-accent underline" href={safeExternalUrl(data.source.company_url)!} target="_blank" rel="noreferrer">Official company website ↗</a> : null}
        </div>
      </div>
      {data.source.web_research_skipped ? <p className="mt-4 rounded bg-[#fff7e7] px-4 py-3 text-sm text-ink">Web research was skipped for this kit. Turn research on when creating a new kit to search interview reports by company and role.</p> : data.source.pages_used.length === 0 ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded bg-[#fff7e7] px-4 py-3 text-sm text-ink"><p>{data.source.company_url ? "No official company website pages were retrieved. Interview-report research is shown separately under Rounds." : "PrepKit could not identify or retrieve an official company website from the company name. Interview-report research is shown separately under Rounds."}</p>{!data.source.company_url && data.company_brief.origin === "generated" ? <Button variant="secondary" disabled={retryingCompanyResearch} onClick={() => void retryCompanyResearch()}>{retryingCompanyResearch ? "Retrying research…" : "Retry company website search"}</Button> : null}{companyResearchRetryError ? <p role="alert" className="w-full text-red-800">Could not queue company research. Please try again.</p> : null}</div> : null}
    </section>
    <section id="topics" aria-labelledby="topic-overview-heading" className="scroll-mt-20 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="topic-overview-heading" className="text-xl font-semibold">Topics</h2><Button variant="secondary" disabled={refreshingTopics} onClick={() => void refreshStudyTopics()}>{refreshingTopics ? "Building role-based study plan…" : "Refresh study topics and schedule"}</Button></div>
      {topicRefreshError ? <p className="mt-2 text-sm text-red-700" role="alert">{topicRefreshError}</p> : null}
      <p className="mt-1 text-sm text-muted">Topics are grouped under the reported interview stage or clearly labeled role-based practice stage. Study the subjects for each stage here.</p>
      {allTopics.length ? <div className="mt-5">
        {[...topicGroups].map(([roundName, roundTopics]) => <div key={roundName} className="mb-5 rounded border border-border bg-white p-4"><h3 className="font-semibold">{roundName}</h3><ul className="mt-2 divide-y divide-border">{roundTopics.map((topic) => {
          const priorityRank = allTopics.findIndex((item) => item.id === topic.id) + 1;
          const questionIds = data.questions.filter((question) => question.topic_ids?.includes(topic.id) || question.requirement_ids.some((id) => topic.requirement_ids.includes(id))).map((question) => question.id);
          return <li key={topic.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium" title={topic.label}>{topicHeading(topic.label)}</h4><span className="rounded bg-page px-2 py-0.5 text-xs text-muted">{`Priority ${priorityRank}`}</span></div><p className="mt-1 text-sm text-muted">{topicDescription(topic.description)}</p>{topic.subtopics?.length ? <ul className="mt-2 flex flex-wrap gap-2">{topic.subtopics.map((subtopic) => <li key={subtopic} className="rounded bg-accent-tint px-2 py-1 text-xs text-accent">{subtopic}</li>)}</ul> : null}</div>{questionIds.length ? <LinkButton href={`/kits/${kitId}/practice?questions=${questionIds.join(",")}`} variant="ghost" className="min-h-9 px-0">Practise related questions</LinkButton> : null}</li>;
        })}</ul></div>)}
      </div> : null}
    </section>
    <section id="rounds" className="scroll-mt-20 border-b border-border pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Rounds</h2><p className="mt-1 text-sm text-muted">Candidate reports guide interview practice. The job description is used for rounds only when it explicitly describes the interview process.</p></div><span className="rounded border border-border px-2 py-1 text-xs text-muted">{research.research_scope === "company_specific" ? "Company interview reports" : research.research_scope === "role_level" ? "Comparable role reports" : "Role-based guidance"}</span></div>
      {research.job_description_interview_info?.details.length ? <p className="mt-3 rounded bg-page px-4 py-3 text-sm"><strong>Interview details stated in the job description:</strong> {research.job_description_interview_info.details.join(" · ")}{research.job_description_interview_info.expected_round_count ? ` (states ${research.job_description_interview_info.expected_round_count} rounds)` : ""}</p> : null}
      {research.research_scope === "company_specific" ? <p className="mt-3 text-sm">{roundCount ? `The job description explicitly states ${roundCount} interview rounds. Candidate reports below are anecdotal and do not establish a fixed sequence.` : "Company interview reports were found. Their formats are anecdotal and do not establish the total number or sequence of rounds."}</p> : research.research_scope === "role_level" ? <p className="mt-3 text-sm text-muted">Related role-level interview reports were found. They inform these practice areas but do not confirm this company’s process.</p> : <p className="mt-3 text-sm text-muted">No usable interview reports were found. These are role-based practice suggestions, not a confirmed company process.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={refreshingInterviewResearch} onClick={() => void refreshInterviewResearch()}>{refreshingInterviewResearch ? "Searching interview reports…" : "Refresh interview research"}</Button>{interviewResearchRefreshError ? <p className="text-sm text-red-700" role="alert">{interviewResearchRefreshError}</p> : null}</div>
      {!data.questions.some((question) => question.source_type === "reported") ? <p className="mt-3 rounded bg-page px-4 py-3 text-sm text-muted">Practice prompts are built around these reported or clearly labeled role-level interview formats. They are original exercises, not verbatim company questions; job requirements provide context rather than deciding the round topics.</p> : null}
      <ul className="mt-3 space-y-3">{displayedRounds.map((round) => {
        const completed = data.round_progress.completed_rounds.some((name) => name.trim().toLowerCase() === round.name.trim().toLowerCase());
        const preparing = data.round_progress.current_round.trim().toLowerCase() === round.name.trim().toLowerCase();
        const reportedQuestions = data.questions.filter((question) => question.source_type === "reported" && question.round_name?.trim().toLowerCase() === round.name.trim().toLowerCase());
        const expectations = roundOnlyExpectations(round, allTopics);
        return <li key={round.id} className="rounded border border-border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{round.basis === "company_reports" ? `Reported format: ${round.name}` : round.basis === "job_description" ? round.name : round.basis === "role_reports" ? `Comparable-role format: ${round.name}` : `Role-based practice: ${round.name}`}</h3><span className="text-xs text-muted">{completed ? "Completed" : preparing ? "Preparing" : "Upcoming"}</span></div><p className="mt-2 text-sm text-muted">{round.description}</p><p className="mt-1 text-xs text-muted">{round.basis === "job_description" ? "Explicitly stated in the job description" : round.basis === "company_reports" ? "Based on company interview reports; anecdotal, not a confirmed sequence" : round.basis === "role_reports" ? "Based on comparable role reports; not confirmed for this company" : "Practice guidance only; verify the actual employer process"}</p>{expectations.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{expectations.map((item) => <li key={item}>{item}</li>)}</ul> : null}{uniqueSources(round.sources).length ? <><p className="mt-3 text-xs text-muted">{uniqueSources(round.sources).length} sources · {round.confidence ? `${round.confidence} confidence` : "expectation confidence unavailable"}</p><ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">{uniqueSources(round.sources).map((source) => <li key={source.url}><a className="text-accent underline" href={source.url} target="_blank" rel="noreferrer">{sourceLabel(source)}</a></li>)}</ul></> : null}{reportedQuestions.length ? <div className="mt-4 border-t border-border pt-3"><h4 className="text-sm font-semibold">Previously reported questions</h4><ul className="mt-2 space-y-3">{reportedQuestions.map((question) => <li key={question.id} className="text-sm"><p>{question.prompt}</p><p className="mt-1 text-xs text-muted">Anecdotal report · {question.report_count ?? "Report count unavailable"} reports · {question.reported_at ?? "Date unavailable"} · reliability {question.reliability ?? "unverified"}</p>{question.practice_type === "coding" && safeExternalUrl(question.source_url) ? <a className="mt-1 inline-block text-accent underline" href={safeExternalUrl(question.source_url)!} target="_blank" rel="noreferrer">Open coding problem{question.source_platform ? ` on ${question.source_platform}` : ""} ↗</a> : <LinkButton className="mt-1 min-h-9 px-0" variant="ghost" href={`/kits/${kitId}/practice?questions=${question.id}`}>Practise in PrepKit</LinkButton>}</li>)}</ul></div> : null}</li>;
      })}</ul>
      {data.round_progress.completed_rounds.length || data.round_progress.current_round ? <div className="mt-4"><h3 className="text-sm font-semibold">Your progress</h3>{data.round_progress.completed_rounds.length ? <p className="mt-1 text-sm">Completed: {data.round_progress.completed_rounds.join(", ")}</p> : null}{data.round_progress.current_round ? <p className="mt-1 text-sm">Preparing: {data.round_progress.current_round}</p> : null}</div> : <p className="mt-4 text-sm text-muted">You can update round progress after verifying the interview format.</p>}
    </section>


    <section id="schedule" className="scroll-mt-20 pb-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Your schedule</h2><LinkButton href={`/kits/${kitId}/schedule`} variant="ghost">Full schedule →</LinkButton></div><ul className={`mt-3 divide-y divide-border border-y border-border `}>{data.schedule.days.slice(0, 3).map((day) => <li key={day.day} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">Day {day.day}: {day.focus}</p><p className="mt-1 text-xs text-muted">{day.question_ids.length} {day.question_ids.length === 1 ? "question" : "questions"} · {day.flashcard_ids?.length ?? 0} {(day.flashcard_ids?.length ?? 0) === 1 ? "flashcard" : "flashcards"}</p></div><span className="font-mono text-sm">{day.minutes} min</span></li>)}</ul></section>

    {saveState === "conflict" ? <div role="alert" className="fixed bottom-4 right-4 z-30 max-w-sm border border-[#e8c99a] bg-[#fff7e7] p-4 shadow-card"><p className="text-sm font-medium">This kit changed somewhere else</p><p className="mt-1 text-xs text-muted">Your edits are still on this screen.</p><Button variant="secondary" className="mt-2" onClick={() => void retry()}>Try saving again</Button></div> : null}
  </div>;
}
