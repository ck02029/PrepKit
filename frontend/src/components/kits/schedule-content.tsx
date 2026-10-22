"use client";

import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { emptyKitData } from "@/lib/empty-kit";
import { fetchScheduleProgress, loadKitData, regenerateKitSection, setScheduleDayCompleted } from "@/lib/api";
import type { KitData } from "@/lib/schema";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { syncPracticeSessions, type SavedPracticeSession } from "@/lib/practice-sessions";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function ScheduleContent({ kitId }: { kitId: string }) {
  const router = useRouter();
  const [data, setData] = useState<KitData>(emptyKitData);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerationError, setRegenerationError] = useState("");
  const queryClient = useQueryClient();
  const kitDataQuery = useQuery({ queryKey: queryKeys.kitData(kitId), queryFn: () => loadKitData(kitId) });
  const progressQuery = useQuery({ queryKey: queryKeys.scheduleProgress(kitId), queryFn: () => fetchScheduleProgress(kitId) });
  const sessionsQuery = useQuery({ queryKey: queryKeys.practiceSessions(kitId), queryFn: () => syncPracticeSessions(kitId) });
  const progressMutation = useMutation({
    mutationFn: ({ day, completed }: { day: number; completed: boolean }) => setScheduleDayCompleted(kitId, day, completed),
    onMutate: async ({ day, completed }) => {
      const key = queryKeys.scheduleProgress(kitId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Awaited<ReturnType<typeof fetchScheduleProgress>>>(key) ?? [];
      queryClient.setQueryData(key, previous.map((item) => item.day === day ? { ...item, status: completed ? "completed" as const : "not_started" as const } : item));
      return { previous };
    },
    onError: (_error, _variables, context) => { if (context) queryClient.setQueryData(queryKeys.scheduleProgress(kitId), context.previous); },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.scheduleProgress(kitId) }); },
  });
  useEffect(() => { if (kitDataQuery.data) setData(kitDataQuery.data.data); }, [kitDataQuery.data]);
  const sessions = sessionsQuery.data ?? [];
  const done = (progressQuery.data ?? []).filter((item) => item.status === "completed").map((item) => String(item.day));

  const days = data.schedule.days;
  const questions = data.questions;
  const requirements = data.role.requirements;
  const topics = data.practice_topics;
  const totalMinutes = days.reduce((total, day) => total + day.minutes, 0);
  const daysByWeek = useMemo(() => {
    const groups = new Map<number, typeof days>();
    for (const day of days) {
      const week = Math.floor((day.day - 1) / 7) + 1;
      groups.set(week, [...(groups.get(week) ?? []), day]);
    }
    return [...groups.entries()];
  }, [days]);
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const requirementLanding = requirements.map((requirement) => ({
    requirement,
    days: days.filter((day) => day.requirement_ids?.includes(requirement.id)
      || day.topic_ids?.some((topicId) => topicMap.get(topicId)?.requirement_ids.includes(requirement.id))
      || day.question_ids.some((id) => {
        const question = questionMap.get(id);
        return question?.requirement_ids.includes(requirement.id)
          || question?.topic_ids?.some((topicId) => topicMap.get(topicId)?.requirement_ids.includes(requirement.id));
      })),
  }));

  function toggle(dayNumber: number, checked: boolean) {
    progressMutation.mutate({ day: dayNumber, completed: checked });
  }

  async function regenerateSchedule() {
    setRegenerating(true);
    setRegenerationError("");
    try {
      await regenerateKitSection(kitId, "schedule");
      router.push(`/kits/${kitId}?generating=1`);
    } catch (error) {
      setRegenerationError(error instanceof Error ? error.message : "The schedule could not be regenerated.");
      setRegenerating(false);
    }
  }

  if (kitDataQuery.isPending || progressQuery.isPending || sessionsQuery.isPending) return <div aria-busy="true" aria-label="Loading schedule" className="space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  if (kitDataQuery.isError || progressQuery.isError || sessionsQuery.isError || !kitDataQuery.data) return <ErrorState title="Schedule unavailable" message="PrepKit could not load this kit's schedule from the server. Try again when the API is available." onRetry={() => { void kitDataQuery.refetch(); void progressQuery.refetch(); void sessionsQuery.refetch(); }} />;
  if (days.length === 0) return <EmptyState title="No schedule yet" description="Return to your kit and regenerate the schedule." action={<LinkButton href={`/kits/${kitId}`}>Back to kit</LinkButton>} />;

  const grouped = days.length > 14;
  const latestDailyResult = (dayNumber: number) => sessions.filter((session) => session.kind === "daily" && session.day === dayNumber && session.completedAt).sort((a, b) => (b.scorePercent ?? 0) - (a.scorePercent ?? 0))[0];
  const hasWork = (day: KitData["schedule"]["days"][number]) => day.question_ids.length > 0 || Boolean(day.flashcard_ids?.length);
  const currentDay = days.find((day) => hasWork(day) && !done.includes(String(day.day)))?.day ?? days.find(hasWork)?.day;
  return <div className="flex min-w-0 flex-col gap-6">
    {progressMutation.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/25 bg-danger/[0.06] px-4 py-3 text-sm text-danger"><span>Schedule progress could not be saved to your account.</span><button className="font-medium underline" onClick={() => progressMutation.reset()}>Dismiss</button></div> : null}
    {data.schedule.warnings?.length ? <aside role="status" aria-label="Schedule warnings" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><h2 className="font-semibold">Some practice did not fit this schedule</h2><ul className="mt-2 list-disc space-y-1 pl-5">{data.schedule.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></aside> : null}
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link href={`/kits/${kitId}`} className="text-sm text-accent">← Builder</Link><h1 className="mt-2 text-2xl font-semibold">Preparation schedule</h1></div><div className="flex items-center gap-3"><span className="rounded-full bg-accent-tint px-3 py-1.5 text-sm font-medium text-accent">{totalMinutes} total minutes</span><button type="button" onClick={() => void regenerateSchedule()} disabled={regenerating} className="min-h-10 rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-50">{regenerating ? "Regenerating…" : "Regenerate schedule"}</button></div></header>
    {regenerationError ? <p role="alert" className="text-sm text-red-700">{regenerationError}</p> : null}
    <div className="rounded-2xl border border-[#d8e5dd] bg-[#eff7f1] p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#23644f]">Today’s focus</p>{currentDay ? <><h2 className="mt-1 text-lg font-semibold">Day {currentDay}: {days.find((day) => day.day === currentDay)?.focus}</h2><p className="mt-1 text-sm text-muted">Use the daily practice session if helpful, then mark the schedule day complete when you’re ready. Practice history is tracked separately.</p><LinkButton href={`/kits/${kitId}/practice?day=${currentDay}`} className="mt-4">Open today’s session</LinkButton></> : <p className="mt-2 text-sm text-muted">No preparation tasks remain.</p>}</div>
    {grouped ? <div className="space-y-3">{daysByWeek.map(([week, weekDays]) => <details key={week} open={week === 1} className="border-y border-border"><summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Week {week} <span className="ml-2 text-sm font-normal text-muted">{weekDays.length} days</span></summary><div className="divide-y divide-border">{weekDays.map((day) => <DayCard key={day.day} day={day} done={done.includes(String(day.day))} dailyResult={latestDailyResult(day.day)} isToday={day.day === currentDay} onToggle={(checked) => toggle(day.day, checked)} questionMap={questionMap} requirements={requirements} topics={topics} kitId={kitId} />)}</div></details>)}</div> : <div className="divide-y divide-border border-y border-border">{days.map((day) => <DayCard key={day.day} day={day} done={done.includes(String(day.day))} dailyResult={latestDailyResult(day.day)} isToday={day.day === currentDay} onToggle={(checked) => toggle(day.day, checked)} questionMap={questionMap} requirements={requirements} topics={topics} kitId={kitId} />)}</div>}
    <section><h2 className="text-lg font-semibold">Requirement coverage</h2>
      <div className="mt-3 hidden overflow-x-auto border-y border-border md:block"><table className="w-full min-w-[520px] text-left text-sm"><caption className="sr-only">Where each requirement appears in the preparation schedule</caption><thead><tr className="border-b border-border text-xs text-muted"><th className="py-2 pr-3">Requirement</th><th className="py-2 pr-3">Scheduled on</th><th className="py-2">Priority</th></tr></thead><tbody>{requirementLanding.map(({ requirement, days: landing }) => <tr key={requirement.id} className={`border-b border-border last:border-0 ${requirement.priority === "must" && !landing.length ? "bg-red-50 text-red-800" : ""}`}><td className="py-3 pr-3">{requirement.text}</td><td className="py-3 pr-3">{landing.length ? landing.map((day) => `Day ${day.day}`).join(", ") : requirement.priority === "must" ? "Missing from schedule" : "Not scheduled"}</td><td className="py-3"><span className={`rounded px-2 py-0.5 text-xs ${requirement.priority === "must" ? "bg-[#fce9e6] text-[#8a1f14]" : "bg-nice-bg text-nice-text"}`}>{requirement.priority}</span></td></tr>)}</tbody></table></div>
      <ul className="mt-3 divide-y divide-border border-y border-border md:hidden">{requirementLanding.map(({ requirement, days: landing }) => <li key={requirement.id} className={`py-3 ${requirement.priority === "must" && !landing.length ? "text-red-800" : ""}`}><p className="text-sm font-medium">{requirement.text}</p><p className="mt-1 text-xs">{landing.length ? landing.map((day) => `Day ${day.day}`).join(", ") : requirement.priority === "must" ? "Missing from schedule" : "Not scheduled"}</p><span className={`mt-2 inline-block rounded px-2 py-0.5 text-xs ${requirement.priority === "must" ? "bg-[#fce9e6] text-[#8a1f14]" : "bg-nice-bg text-nice-text"}`}>{requirement.priority}</span></li>)}</ul>
    </section>
  </div>;
}

function DayCard({ day, done, dailyResult, isToday, onToggle, questionMap, requirements, topics, kitId }: { day: KitData["schedule"]["days"][number]; done: boolean; dailyResult?: SavedPracticeSession; isToday: boolean; onToggle: (checked: boolean) => void; questionMap: Map<string, KitData["questions"][number]>; requirements: KitData["role"]["requirements"]; topics: KitData["practice_topics"]; kitId: string }) {
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const requirementIds = [...new Set([...day.question_ids.flatMap((id) => { const question = questionMap.get(id); return [...(question?.requirement_ids ?? []),...(question?.topic_ids ?? []).flatMap((topicId) => topicMap.get(topicId)?.requirement_ids ?? [])]; }),...(day.topic_ids ?? []).flatMap((topicId) => topicMap.get(topicId)?.requirement_ids ?? []),...(day.requirement_ids??[])])];
  const dayRequirements = requirements.filter((requirement) => requirementIds.includes(requirement.id));
  return <article className="min-w-0 py-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="font-mono text-xs uppercase text-muted">Day {day.day}{isToday ? " · Today" : ""}</p><h2 className="mt-1 break-words font-semibold">{day.focus}</h2></div><div className="flex shrink-0 items-center gap-3"><span className="font-mono text-sm">{day.minutes} min</span><label className="flex min-h-10 items-center gap-2 text-sm" title="Mark this schedule day complete separately from practice"><input type="checkbox" aria-label={`Mark day ${day.day} done`} checked={done} onChange={(event) => onToggle(event.target.checked)} />Done</label></div></div>{day.question_ids.length === 0 && !(day.flashcard_ids?.length) ? <p className="mt-3 inline-flex rounded bg-[#e8edf0] px-2.5 py-1.5 text-xs font-medium text-[#35434a]">Break day · no questions scheduled</p> : <><ul className="mt-3 flex flex-wrap gap-2">{day.question_ids.map((id) => { const question = questionMap.get(id); if (!question) return null; return <li key={id} className="max-w-full break-words rounded border border-border bg-white px-2.5 py-1.5 text-xs"><span aria-label={`Difficulty ${question.difficulty} out of 3`} className="mr-1 text-accent">{"●".repeat(question.difficulty)}{"○".repeat(3 - question.difficulty)}</span>{question.prompt}</li>; })}</ul>{day.flashcard_ids?.length ? <p className="mt-2 text-xs text-muted">{day.flashcard_ids.length} flashcards to review</p> : null}<ul className="mt-2 flex flex-wrap gap-1.5">{dayRequirements.map((requirement) => <li key={requirement.id} className={`max-w-full break-words rounded px-2 py-1 text-xs ${requirement.priority === "must" ? "bg-[#fce9e6] text-[#8a1f14]" : "bg-nice-bg text-nice-text"}`}>{requirement.priority}: {requirement.text}</li>)}</ul><div className="mt-3 flex flex-wrap items-center gap-3"><Link href={`/kits/${kitId}/practice?day=${day.day}`} className="text-sm font-medium text-[#23644f] underline">{dailyResult ? "Retake daily session" : "Start daily session"}</Link><span className="text-xs text-muted">{dailyResult ? `Best practice score ${dailyResult.scorePercent ?? 0}%` : "Practice session not taken yet"}</span></div></>}</article>;
}
