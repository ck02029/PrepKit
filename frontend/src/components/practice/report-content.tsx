"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { loadKitData } from "@/lib/api";
import { emptyKitData } from "@/lib/empty-kit";
import type { KitData, KitQuestion, RoleRequirement } from "@/lib/schema";
import { syncPracticeSessions } from "@/lib/practice-sessions";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type RequirementScore = {
  requirement: RoleRequirement;
  average: number | null;
  ratedCount: number;
  questionCount: number;
};

export function ReportContent({ kitId }: { kitId: string }) {
  const [data, setData] = useState<KitData>(emptyKitData);
  const kitDataQuery = useQuery({ queryKey: queryKeys.kitData(kitId), queryFn: () => loadKitData(kitId) });
  const sessionsQuery = useQuery({ queryKey: queryKeys.practiceSessions(kitId), queryFn: () => syncPracticeSessions(kitId) });
  const ratings = useMemo(() => {
    const latest: Record<string, { rating: number; time: number }> = {};
    for (const session of sessionsQuery.data ?? []) {
      const time = new Date(session.completedAt ?? session.createdAt).getTime();
      for (const [id, rating] of Object.entries(session.ratings)) if (time >= (latest[id]?.time ?? 0)) latest[id] = { rating, time };
    }
    return Object.fromEntries(Object.entries(latest).map(([id, item]) => [id, item.rating]));
  }, [sessionsQuery.data]);

  useEffect(() => { if (kitDataQuery.data) setData(kitDataQuery.data.data); }, [kitDataQuery.data]);

  const practiced = data.questions.filter((question) => ratings[question.id] !== undefined);
  const mustRequirements = data.role.requirements.filter((requirement) => requirement.priority === "must");
  const mustTouched = mustRequirements.filter((requirement) =>
    data.questions.some((question) => question.requirement_ids.includes(requirement.id) && ratings[question.id] !== undefined),
  ).length;
  const averageConfidence = practiced.length
    ? practiced.reduce((total, question) => total + ratings[question.id], 0) / practiced.length
    : null;

  const requirementScores = useMemo(() => data.role.requirements.map((requirement): RequirementScore => {
    const related = data.questions.filter((question) => question.requirement_ids.includes(requirement.id));
    const scores = related.map((question) => ratings[question.id]).filter((score): score is number => score !== undefined);
    return {
      requirement,
      average: scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null,
      ratedCount: scores.length,
      questionCount: related.length,
    };
  }).sort((first, second) => {
    if (first.average === null && second.average !== null) return -1;
    if (first.average !== null && second.average === null) return 1;
    return (first.average ?? 0) - (second.average ?? 0);
  }), [data, ratings]);

  const drillQuestions = useMemo(() => {
    const weakRequirementIds = new Set(requirementScores.slice(0, 3).map(({ requirement }) => requirement.id));
    const seen = new Set<string>();
    return data.questions
      .filter((question) => question.requirement_ids.some((id) => weakRequirementIds.has(id)))
      .sort((first, second) => (ratings[first.id] ?? 0) - (ratings[second.id] ?? 0))
      .filter((question) => {
        if (seen.has(question.id)) return false;
        seen.add(question.id);
        return true;
      });
  }, [data.questions, ratings, requirementScores]);

  if (kitDataQuery.isPending || sessionsQuery.isPending) return <div aria-busy="true" aria-label="Loading practice report" className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (sessionsQuery.isError || kitDataQuery.isError || !kitDataQuery.data) return <div className="mx-auto max-w-5xl"><ErrorState title="Practice report unavailable" message="PrepKit could not load this kit or its saved practice history from the server. Try again when the API is available." onRetry={() => { void kitDataQuery.refetch(); void sessionsQuery.refetch(); }} /></div>;

  const drillIds = drillQuestions.map((question) => question.id);
  const printQuestions = drillQuestions.slice(0, 5);
  const schedule = data.schedule.days;

  return <div className="report-screen mx-auto flex w-full max-w-5xl flex-col gap-7 py-4">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><LinkButton variant="ghost" className="min-h-9 px-0" href={`/kits/${kitId}`}>← Builder</LinkButton><p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-accent">Practice report</p><h1 className="mt-1 text-2xl font-semibold">{data.role.title}</h1><p className="mt-1 text-sm text-muted">{data.source.company}</p></div>
      <div className="flex flex-wrap gap-2"><LinkButton href={`/kits/${kitId}/practice${drillIds.length ? `?questions=${drillIds.join(",")}` : ""}`} variant="primary">Drill weak spots</LinkButton><Button variant="secondary" onClick={() => window.print()}>Print one-pager</Button></div>
    </header>

    <section aria-label="Practice statistics" className="grid gap-3 sm:grid-cols-3">
      <StatTile label="Cards practised" value={`${practiced.length} / ${data.questions.length}`} detail="Questions with a saved rating" />
      <StatTile label="Must-haves touched" value={`${mustTouched} / ${mustRequirements.length}`} detail="At least one linked question rated" />
      <StatTile label="Average confidence" value={averageConfidence === null ? "—" : `${averageConfidence.toFixed(1)} / 5`} detail={averageConfidence === null ? "Rate a card to see your average" : "Across practised cards"} />
    </section>

    <section aria-labelledby="confidence-heading">
      <div className="border-b border-border pb-3"><h2 id="confidence-heading" className="text-lg font-semibold">Confidence by requirement</h2><p className="mt-1 text-sm text-muted">Unpractised requirements appear first, followed by the lowest average confidence.</p></div>
      <ol className="divide-y divide-border">
        {requirementScores.map(({ requirement, average, ratedCount, questionCount }, index) => <li key={requirement.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)] sm:items-center">
          <div><div className="flex flex-wrap items-center gap-2"><span aria-hidden="true" className="font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span><h3 className="text-sm font-medium">{requirement.text}</h3><span className={`rounded px-2 py-0.5 text-xs ${requirement.priority === "must" ? "bg-[#fce9e6] text-[#8a1f14]" : "bg-nice-bg text-nice-text"}`}>{requirement.priority}</span></div><p className="mt-1 pl-7 text-xs text-muted">{ratedCount} of {questionCount} linked cards practised</p></div>
          <div><div className="flex items-center justify-between gap-3 text-xs"><span>{average === null ? "Not practised · weakest" : `Average confidence ${average.toFixed(1)} / 5`}</span><span className="font-mono">{average === null ? "—" : `${Math.round(average * 20)}%`}</span></div><div role="progressbar" aria-label={`Confidence for ${requirement.text}`} aria-valuemin={0} aria-valuemax={5} aria-valuenow={average ?? 0} aria-valuetext={average === null ? "Not practised" : `${average.toFixed(1)} out of 5`} className="mt-2 h-2 overflow-hidden rounded-full bg-[#e4e8e4]"><div className="h-full bg-accent" style={{ width: `${average === null ? 0 : average * 20}%` }} /></div></div>
        </li>)}
      </ol>
    </section>

    <section aria-labelledby="drill-heading" className="border-t border-border pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="drill-heading" className="text-lg font-semibold">Drill these first</h2><p className="mt-1 text-sm text-muted">Questions linked to your weakest requirements, with unseen cards first.</p></div><LinkButton href={`/kits/${kitId}/practice${drillIds.length ? `?questions=${drillIds.join(",")}` : ""}`} variant="secondary">Drill weak spots</LinkButton></div>
      {drillQuestions.length ? <ol className="mt-3 divide-y divide-border border-y border-border">{drillQuestions.map((question, index) => <QuestionRow key={question.id} question={question} index={index} score={ratings[question.id]} />)}</ol> : <p className="mt-3 border-y border-border py-5 text-sm text-muted">No linked questions are available for these requirements yet.</p>}
    </section>

    <section className="print-onepager" aria-label="Printable interview preparation one-pager">
      <header className="print-header"><p className="print-kicker">PREPKIT · INTERVIEW PREPARATION</p><h1>{data.role.title}</h1><p>{data.source.company} · {data.source.location} · {data.role.seniority}</p></header>
      <section><h2>Company brief</h2><p>{data.company_brief.summary}</p><p>{data.company_brief.what_they_do}</p></section>
      <section><h2>Must-haves</h2><ul>{mustRequirements.map((requirement) => <li key={requirement.id}>{requirement.text}</li>)}</ul></section>
      <section><h2>Weakest questions</h2><ol>{printQuestions.map((question) => <li key={question.id}><strong>{question.prompt}</strong><p>{question.answer_outline}</p></li>)}</ol></section>
      <section><h2>Preparation schedule</h2><ol>{schedule.map((day) => <li key={day.day}><strong>Day {day.day} · {day.minutes} minutes</strong><p>{day.focus}</p></li>)}</ol></section>
    </section>
  </div>;
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="border border-border bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p><p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></article>;
}

function QuestionRow({ question, index, score }: { question: KitQuestion; index: number; score?: number }) {
  return <li className="flex items-start gap-3 py-3"><span className="mt-0.5 font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><p className="text-sm font-medium">{question.prompt}</p><p className="mt-1 text-xs text-muted">{score === undefined ? "Unpractised" : `Confidence ${score} / 5`} · {question.category.replaceAll("-", " ")}</p></div></li>;
}
