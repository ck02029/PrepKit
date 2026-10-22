"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { QuestionManager } from "@/components/practice/question-manager";
import { useAutosave } from "@/hooks/use-autosave";
import { loadKitData, regenerateKitSection } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { emptyKitData } from "@/lib/empty-kit";
import type { KitData, PracticeTopic } from "@/lib/schema";
import { savePracticeSession, syncPracticeSessions, type SavedPracticeSession } from "@/lib/practice-sessions";
import { nextQuestionSet } from "@/lib/practice-rotation";
import { topicHeading } from "@/lib/topic-heading";

function safeLink(value?: string | null) { try { const url = value ? new URL(value) : null; return url && ["https:", "http:"].includes(url.protocol) ? url.toString() : null; } catch { return null; } }

export function PracticeContent({ kitId, initialTopic, initialDay, initialQuestionIds }: { kitId: string; initialTopic?: string; initialDay?: number; initialQuestionIds?: string[] }) {
  const router = useRouter();
  const [data, setData] = useState<KitData>(emptyKitData);
  const queryClient = useQueryClient();
  const [flashcardDraft, setFlashcardDraft] = useState<{ topicId: string; front: string; back: string } | null>(null);
  const [sessionStartError, setSessionStartError] = useState("");
  const [regeneratingQuestions, setRegeneratingQuestions] = useState(false);
  const [generatingFreshQuestions, setGeneratingFreshQuestions] = useState(false);
  const [regenerationError, setRegenerationError] = useState("");
  const { state: saveState, save, retry, setVersion } = useAutosave(kitId);
  const kitDataQuery = useQuery({ queryKey: queryKeys.kitData(kitId), queryFn: () => loadKitData(kitId) });
  const sessionsQuery = useQuery({ queryKey: queryKeys.practiceSessions(kitId), queryFn: () => syncPracticeSessions(kitId) });
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);

  useEffect(() => {
    if (kitDataQuery.data) { setData(kitDataQuery.data.data); setVersion(kitDataQuery.data.version); }
  }, [kitDataQuery.data, setVersion]);

  const topics: PracticeTopic[] = data.practice_topics.length ? data.practice_topics.map((topic) => ({ ...topic, subtopics: topic.subtopics ?? [] })) : data.role.requirements.map((requirement) => ({ id: `legacy-${requirement.id}`, label: requirement.text, description: "Topic created from an existing role requirement.", subtopics: [], requirement_ids: [requirement.id], learning_resources: [] }));
  const questionCount = data.questions.length;
  const codingQuestions = data.questions.filter((question) => question.practice_type === "coding");
  const flashcards = data.flashcards;
  const rounds = useMemo(() => [...new Set(data.questions.map((question) => question.round_name).filter((name): name is string => Boolean(name)))], [data.questions]);
  const allRatings = useMemo(() => {
    const merged: Record<string, number> = {};
    const timestamps: Record<string, number> = {};
    for (const session of sessions) {
      const time = new Date(session.completedAt ?? session.createdAt).getTime();
      for (const [questionId, value] of Object.entries(session.ratings)) if (time >= (timestamps[questionId] ?? 0)) { merged[questionId] = value; timestamps[questionId] = time; }
    }
    return merged;
  }, [sessions]);
  const completed = sessions.filter((session) => session.completedAt);
  const averageScore = completed.length ? Math.round(completed.reduce((sum, session) => sum + (session.scorePercent ?? 0), 0) / completed.length) : 0;
  const passedDaily = new Set(completed.filter((session) => session.kind === "daily" && (session.scorePercent ?? 0) > 25).map((session) => session.day)).size;

  function topicQuestionIds(topicId: string) {
    const topic = topics.find((item) => item.id === topicId);
    return data.questions.filter((question) => question.topic_ids?.includes(topicId) || (!question.topic_ids?.length && topic?.requirement_ids.some((id) => question.requirement_ids.includes(id)))).map((question) => question.id);
  }
  function topicFlashcardIds(topicId: string) {
    const topic = topics.find((item) => item.id === topicId);
    return flashcards.filter((card) => card.topic_ids?.includes(topicId) || (!card.topic_ids?.length && topic?.requirement_ids.some((id) => card.requirement_ids.includes(id)))).map((card) => card.id);
  }

  async function startSession(input: Omit<SavedPracticeSession, "id" | "kitId" | "currentIndex" | "answers" | "ratings" | "createdAt">) {
    const questionIds = nextQuestionSet(input.questionIds, sessions, input.label);
    if (!questionIds.length && !input.flashcardIds.length) { setSessionStartError("This session has no questions or flashcards yet."); return; }
    setSessionStartError("");
    const session: SavedPracticeSession = { ...input, questionIds, id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, kitId, currentIndex: 0, answers: {}, ratings: {}, createdAt: new Date().toISOString() };
    try {
      await savePracticeSession(session);
      await queryClient.invalidateQueries({ queryKey: queryKeys.practiceSessions(kitId) });
      router.push(`/kits/${kitId}/practice/session?sessionId=${encodeURIComponent(session.id)}`);
    } catch {
      setSessionStartError("This session could not be saved to your account. Please try again.");
    }
  }

  async function regenerateQuestions() {
    setRegeneratingQuestions(true);
    setRegenerationError("");
    try {
      await regenerateKitSection(kitId, "questions");
      router.push(`/kits/${kitId}?generating=1`);
    } catch (error) {
      setRegenerationError(error instanceof Error ? error.message : "Questions could not be regenerated.");
      setRegeneratingQuestions(false);
    }
  }

  async function generateFreshQuestions() {
    setGeneratingFreshQuestions(true);
    setRegenerationError("");
    try {
      await regenerateKitSection(kitId, "questions", undefined, "append_fresh");
      router.push(`/kits/${kitId}?generating=1`);
    } catch (error) {
      setRegenerationError(error instanceof Error ? error.message : "New questions could not be generated.");
      setGeneratingFreshQuestions(false);
    }
  }

  function addFlashcard() {
    if (!flashcardDraft || !flashcardDraft.front.trim() || !flashcardDraft.back.trim()) return;
    const topic = topics.find((item) => item.id === flashcardDraft.topicId);
    const next = { ...data, practice_topics: data.practice_topics.length ? data.practice_topics : (topic ? [topic] : []), flashcards: [...data.flashcards, { id: `f_${Date.now()}`, front: flashcardDraft.front.trim(), back: flashcardDraft.back.trim(), requirement_ids: topic?.requirement_ids ?? [], topic_ids: [flashcardDraft.topicId], origin: "user" as const, updatedAt: new Date().toISOString() }] };
    setData(next);
    save(next);
    setFlashcardDraft(null);
  }

  if (kitDataQuery.isPending || sessionsQuery.isPending) return <div className="mx-auto max-w-5xl animate-pulse space-y-4 py-8"><div className="h-32 rounded-2xl bg-[#e7e8e3]"/><div className="h-48 rounded-2xl bg-[#e7e8e3]"/></div>;
  if (sessionsQuery.isError || kitDataQuery.isError || !kitDataQuery.data) return <div className="mx-auto max-w-5xl py-8"><ErrorState title="Practice data unavailable" message="PrepKit could not load this kit or its saved practice history. Try again when the server is available." onRetry={() => { void kitDataQuery.refetch(); void sessionsQuery.refetch(); }} /></div>;
  const initialTopicData = initialTopic ? topics.find((topic) => topic.id === initialTopic || topic.id === `legacy-${initialTopic}`) : undefined;
  const initialDayData = initialDay ? data.schedule.days.find((day) => day.day === initialDay) : undefined;
  const initialQuestions = initialQuestionIds?.map((id) => data.questions.find((question) => question.id === id)).filter((question): question is KitData["questions"][number] => Boolean(question)) ?? [];

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 pb-12">
    <header className="overflow-hidden rounded-3xl bg-[#153b33] px-6 py-7 text-white shadow-sm sm:px-9 sm:py-9">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-[#b3d9c9]">{data.source.company} · {data.role.title}</p><h1 className="mt-2 text-3xl font-semibold">Practice</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Choose a topic, round, day, or flashcard set. Each saved session draws up to five least-recently-seen questions from that set.</p></div><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs">{questionCount} questions · {flashcards.length} flashcards</span></div>
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Sessions completed", String(completed.length)], ["Average session score", `${averageScore}%`], ["Daily sessions passed", String(passedDaily)], ["Items rated", String(Object.keys(allRatings).length)]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 px-4 py-3"><p className="text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-white/70">{label}</p></div>)}</div>
    </header>

    {questionCount === 0 ? <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5" role="status"><h2 className="font-semibold">No interview questions were generated</h2><p className="mt-1 text-sm text-muted">{data.source.jd_chars < 40 ? "This kit has little or no job-description detail, so there may not be enough evidence to create role-specific questions. Add more job-description detail and regenerate the questions." : "This kit has no questions to start a question session. Regenerate the question section, or add prompts in the question bank below."}</p><div className="mt-3 flex flex-wrap items-center gap-3"><button onClick={() => void regenerateQuestions()} disabled={regeneratingQuestions} className="min-h-10 rounded-lg bg-[#23644f] px-3 text-sm font-medium text-white disabled:opacity-50">{regeneratingQuestions ? "Regenerating questions…" : "Regenerate questions"}</button>{flashcards.length ? <button onClick={() => startSession({ kind: "practice", label: "Flashcard practice", questionIds: [], flashcardIds: flashcards.map((card) => card.id) })} className="min-h-10 rounded-lg border border-[#23644f] px-3 text-sm font-medium text-[#23644f]">Start flashcard session</button> : null}</div>{regenerationError ? <p className="mt-2 text-sm text-red-700" role="alert">{regenerationError}</p> : null}</section> : null}
    {sessionStartError ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{sessionStartError}</p> : null}

    {(initialTopicData || initialDayData || initialQuestions.length) ? <section className="rounded-2xl border border-[#d8e5dd] bg-[#eff7f1] p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#23644f]">Ready to start</p><h2 className="mt-1 text-lg font-semibold">{initialTopicData ? `${initialTopicData.label} session` : initialDayData ? `Day ${initialDayData.day} daily session` : "Selected question session"}</h2><p className="mt-1 text-sm text-muted">{initialTopicData ? initialTopicData.description : initialDayData?.focus ?? `${initialQuestions.length} selected questions`}</p><button onClick={() => initialTopicData ? startSession({ kind: "practice", label: `${initialTopicData.label} session`, topicId: initialTopicData.id, questionIds: topicQuestionIds(initialTopicData.id), flashcardIds: topicFlashcardIds(initialTopicData.id) }) : initialDayData ? startSession({ kind: "daily", label: `Day ${initialDayData.day} daily session`, day: initialDayData.day, questionIds: initialDayData.question_ids, flashcardIds: initialDayData.flashcard_ids ?? [] }) : startSession({ kind: "practice", label: "Selected question session", questionIds: initialQuestions.map((question) => question.id), flashcardIds: [] })} className="mt-4 rounded-xl bg-[#23644f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#194c3c]">Start session</button></section> : null}

    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#317460]">Whole plan</p><h2 className="mt-1 text-xl font-semibold">Overall practice</h2><p className="mt-1 text-sm text-muted">Mix every question in this kit into one session.</p></div><span className="rounded-full bg-[#edf5f0] px-3 py-1 text-sm font-medium">{questionCount}</span></div><button onClick={() => startSession({ kind: "practice", label: "Overall practice", questionIds: data.questions.map((item) => item.id), flashcardIds: [] })} disabled={!questionCount} className="mt-5 min-h-11 rounded-xl bg-[#23644f] px-4 text-sm font-semibold text-white disabled:opacity-40">Start overall session</button></article>
      <article className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-semibold uppercase tracking-wide text-[#317460]">Continue</p><h2 className="mt-1 text-xl font-semibold">Weak or unseen</h2><p className="mt-1 text-sm text-muted">Focus on questions you have not rated or rated below 3.</p><button onClick={() => startSession({ kind: "practice", label: "Weak or unseen", questionIds: data.questions.filter((question) => allRatings[question.id] === undefined || allRatings[question.id] < 3).map((question) => question.id), flashcardIds: [] })} disabled={!data.questions.some((question) => allRatings[question.id] === undefined || allRatings[question.id] < 3)} className="mt-5 min-h-11 rounded-xl border border-[#23644f] px-4 text-sm font-semibold text-[#23644f] disabled:opacity-40">Start review session</button></article>
    </section>

      <section><SectionHeading kicker="Focused practice" title="Choose a topic" detail="Topics combine the supplied job description with clearly labeled interview-report patterns and role-level preparation."/><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{topics.map((topic) => { const qIds = topicQuestionIds(topic.id); const cardIds = topicFlashcardIds(topic.id); const topicQuestions = data.questions.filter((question) => qIds.includes(question.id)); return <article key={topic.id} className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold" title={topic.label}>{topicHeading(topic.label)}</h3><p className="mt-1 text-sm leading-5 text-muted">{topic.description}</p>{topic.basis ? <p className="mt-2 text-xs font-medium text-[#23644f]">{topic.basis === "job_description" ? "From job description" : topic.basis === "company_reports" ? "Company interview reports" : topic.basis === "role_reports" || topic.basis === "verified_reports" ? "Related role interview reports" : topic.basis === "role_inference" ? "Role-based suggestion" : "Sample topic"}{topic.confidence ? ` · ${topic.confidence} confidence` : ""}</p> : null}</div><span className="shrink-0 rounded-full bg-[#edf5f0] px-2.5 py-1 text-xs font-medium text-[#23644f]">{qIds.length} Q · {cardIds.length} cards</span></div>{topic.evidence?.length ? <blockquote className="mt-3 rounded-lg border-l-2 border-[#8eb9a7] bg-[#f5f8f5] px-3 py-2 text-xs leading-5 text-muted">“{topic.evidence[0]}”</blockquote> : topic.rationale ? <p className="mt-2 text-xs text-muted">{topic.rationale}</p> : null}<ul className="mt-4 flex flex-wrap gap-2">{topic.subtopics.map((subtopic) => <li key={subtopic} className="rounded-lg bg-[#f2f5f2] px-2.5 py-1 text-xs text-[#3f554d]">{subtopic}</li>)}</ul>{topicQuestions.length ? <ul className="mt-4 space-y-2 border-t border-border pt-3">{topicQuestions.map((question) => <li key={question.id} className="rounded-xl bg-[#f8faf8] p-3"><p className="text-sm font-medium">{question.prompt}</p><div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted"><span className="rounded-full bg-white px-2 py-0.5">{question.source_type === "reported" ? "Previously reported" : "Practice example"}</span>{question.round_name ? <span>{question.round_name}</span> : null}{question.practice_type === "coding" && safeLink(question.source_url) ? <a href={safeLink(question.source_url)!} target="_blank" rel="noreferrer" className="text-[#23644f] underline">Open coding link ↗</a> : null}</div></li>)}</ul> : <p className="mt-3 text-xs text-muted">No questions are linked to this topic yet.</p>}<div className="mt-4 flex flex-wrap gap-2">{qIds.length || cardIds.length ? <button onClick={() => startSession({ kind: "practice", label: `${topic.label} session`, topicId: topic.id, questionIds: qIds, flashcardIds: cardIds })} className="min-h-10 rounded-lg bg-[#23644f] px-3 text-sm font-medium text-white">Start topic session</button> : <span className="self-center text-xs text-muted">No linked practice yet</span>}{cardIds.length ? <button onClick={() => startSession({ kind: "practice", label: `${topic.label} flashcards`, topicId: topic.id, questionIds: [], flashcardIds: cardIds })} className="min-h-10 rounded-lg border border-border px-3 text-sm">Practise cards</button> : null}</div>{topic.learning_resources.length ? <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-medium text-muted">Learn more</p><ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{topic.learning_resources.map((resource) => <li key={resource.url}><a className="text-xs text-[#23644f] underline underline-offset-2" href={resource.url} target="_blank" rel="noreferrer">{resource.label} ↗</a></li>)}</ul></div> : null}</article>; })}</div>{!topics.length ? <div className="mt-4 rounded-xl border border-dashed border-border bg-white p-5 text-sm text-muted">No technical topic was explicitly supported by this job description. Add role details or connect research to build a tailored topic list; PrepKit will not fill in generic topics automatically.</div> : null}</section>

    <section><SectionHeading kicker="Write and code" title="Coding sessions" detail="Solve on the linked platform, then return to PrepKit to save your approach and review the session."/><div className="mt-4 grid gap-3 md:grid-cols-2">{codingQuestions.map((question) => { const links = question.coding_links?.filter((link) => link.verified) ?? (safeLink(question.source_url) ? [{ kind: "problem" as const, label: `${question.source_platform ?? "Coding platform"} problem`, url: safeLink(question.source_url)!, verified: true }] : []); return <article key={question.id} className="rounded-2xl border border-border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-semibold uppercase tracking-wide text-[#317460]">{question.topic_ids?.map((id) => topics.find((topic) => topic.id === id)?.label).filter(Boolean).join(" · ") || "Role coding question"}</span><h3 className="mt-2 font-semibold">{question.prompt}</h3><p className="mt-1 text-xs text-muted">{question.round_name ?? "Coding practice"} · Difficulty {question.difficulty}/3</p></div><span className="rounded-full bg-[#edf5f0] px-2.5 py-1 text-xs text-[#23644f]">Coding</span></div><div className="mt-4 flex flex-wrap gap-3">{links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-[#23644f] underline">{link.kind === "problem" ? "Solve on" : "Study with"} {link.label} ↗</a>)}<button onClick={() => startSession({ kind: "practice", label: `Coding: ${question.prompt.slice(0, 48)}`, questionIds: [question.id], flashcardIds: [] })} className="min-h-9 rounded-lg bg-[#23644f] px-3 text-sm font-medium text-white">Start coding session</button></div></article>; })}{!codingQuestions.length ? <p className="rounded-xl border border-dashed border-border bg-white p-5 text-sm text-muted">No coding problem is attached to this kit yet. Add a coding prompt and verified problem link in the question bank.</p> : null}</div></section>

      <section><SectionHeading kicker="Interview structure" title="Choose a round or practice group" detail="Reported formats and role-based practice groups are separated in the labels; practice groups do not confirm an employer's interview process."/><div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-white px-5">{rounds.map((round) => { const count = data.questions.filter((question) => question.round_name === round).length; const practiceGroup = /practice$/i.test(round); return <div key={round} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><h3 className="font-medium">{round}</h3><p className="text-sm text-muted">{practiceGroup ? "Role-based preparation · " : ""}{count} {count === 1 ? "question" : "questions"}</p></div><button onClick={() => startSession({ kind: "practice", label: `${round} session`, roundName: round, questionIds: data.questions.filter((question) => question.round_name === round).map((question) => question.id), flashcardIds: [] })} className="min-h-10 rounded-lg border border-[#23644f] px-3 text-sm font-medium text-[#23644f]">{practiceGroup ? "Start practice session" : "Start round session"}</button></div>; })}{!rounds.length ? <p className="py-4 text-sm text-muted">Round-specific practice will appear when questions are assigned to rounds.</p> : null}</div></section>

    <section><SectionHeading kicker="Daily follow-through" title="Schedule sessions" detail="Use the matching day session to review that day’s questions and flashcards."/><div className="mt-3 grid gap-3 sm:grid-cols-2">{data.schedule.days.map((day) => { const result = sessions.filter((session) => session.kind === "daily" && session.day === day.day && session.completedAt).sort((a, b) => (b.scorePercent ?? 0) - (a.scorePercent ?? 0))[0]; const ready = (result?.scorePercent ?? 0) > 25; const flashcardIds = day.flashcard_ids ?? []; const hasItems = day.question_ids.length > 0 || flashcardIds.length > 0; return <article key={day.day} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white p-4"><div><p className="font-medium">Day {day.day} · {day.focus}</p><p className="mt-1 text-xs text-muted">{day.question_ids.length} {day.question_ids.length === 1 ? "question" : "questions"} · {flashcardIds.length} {flashcardIds.length === 1 ? "flashcard" : "flashcards"} · {day.minutes} min{result ? ` · best ${result.scorePercent ?? 0}%` : " · not completed"}</p></div><button onClick={() => startSession({ kind: "daily", label: `Day ${day.day} daily session`, day: day.day, questionIds: day.question_ids, flashcardIds })} disabled={!hasItems} title={hasItems ? undefined : "This day has no questions or flashcards to practice."} className="min-h-10 shrink-0 rounded-lg bg-[#23644f] px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#e8edf0] disabled:text-[#59656a] disabled:opacity-100">{!hasItems ? "No session content" : ready ? "Retake session" : "Start daily session"}</button></article>; })}</div><LinkButton href={`/kits/${kitId}/schedule`} variant="secondary" className="mt-3">Open full scheduler →</LinkButton></section>

    <section><SectionHeading kicker="Recall" title="Flashcards" detail="Review all cards or make a new card inside a topic."/><div className="mt-3 grid gap-3 sm:grid-cols-2">{topics.map((topic) => { const cardIds = topicFlashcardIds(topic.id); return <article key={topic.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-4"><div><h3 className="font-medium" title={topic.label}>{topicHeading(topic.label)}</h3><p className="text-sm text-muted">{cardIds.length} cards</p></div><div className="flex gap-2">{cardIds.length ? <button onClick={() => startSession({ kind: "practice", label: `${topic.label} flashcards`, topicId: topic.id, questionIds: [], flashcardIds: cardIds })} className="min-h-10 rounded-lg border border-border px-3 text-sm">Review</button> : null}<button onClick={() => setFlashcardDraft({ topicId: topic.id, front: "", back: "" })} className="min-h-10 rounded-lg border border-[#23644f] px-3 text-sm text-[#23644f]">+ Add card</button></div></article>; })}</div>{flashcards.length ? <button onClick={() => startSession({ kind: "practice", label: "All flashcards", questionIds: [], flashcardIds: flashcards.map((card) => card.id) })} className="mt-3 min-h-10 rounded-lg bg-[#23644f] px-4 text-sm font-medium text-white">Review all {flashcards.length} cards</button> : null}</section>

    <section className="rounded-2xl border border-border bg-white p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><SectionHeading kicker="Saved sessions" title="Your sessions" detail="Resume an unfinished session or revisit a completed result. Linked coding activity stays on its external platform."/></div><span className="text-xs text-muted" role="status" aria-live="polite">{saveState === "saving" ? "Saving kit…" : saveState === "error" ? "Kit save failed" : saveState === "conflict" ? "Save conflict" : "Kit saved"}</span></div>{sessions.length ? <ul className="mt-4 divide-y divide-border">{sessions.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{session.label}</p><p className="text-xs text-muted">{new Date(session.createdAt).toLocaleString()} · {session.completedAt ? `Score ${session.scorePercent ?? 0}%` : session.status === "abandoned" ? "Abandoned after 24 hours" : "In progress"}</p></div><button onClick={() => router.push(`/kits/${kitId}/practice/session?sessionId=${encodeURIComponent(session.id)}`)} className="min-h-10 rounded-lg border border-border px-3 text-sm">{session.completedAt ? "View result" : "Resume"}</button></li>)}</ul> : <p className="mt-3 text-sm text-muted">Your started sessions will be saved here.</p>}</section>

    <section className="rounded-2xl border border-border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Question bank</h2><p className="text-sm text-muted">Edit prompts, answer outlines, and coding links used in sessions.</p><p className="mt-1 text-xs text-muted">Fresh generation preserves current questions and excludes exact or closely matching prompts.</p></div><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted" role="status">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : saveState === "conflict" ? "Save conflict" : "Saved"}</span>{saveState === "error" || saveState === "conflict" ? <button onClick={() => void retry()} className="text-xs text-[#23644f] underline">Retry save</button> : null}<button type="button" onClick={() => void generateFreshQuestions()} disabled={generatingFreshQuestions} className="min-h-10 rounded-lg border border-[#23644f] px-3 text-sm font-medium text-[#23644f] disabled:opacity-50">{generatingFreshQuestions ? "Generating new questions…" : "Generate new questions"}</button></div></div>{regenerationError ? <p className="mt-3 text-sm text-red-700" role="alert">{regenerationError}</p> : null}<div className="mt-3"><QuestionManager data={data} onUpdate={(next) => { setData(next); save(next); }} saveState={saveState} onRetry={retry} onRegenerate={async(category)=>{await regenerateKitSection(kitId,"questions",category);router.push(`/kits/${kitId}?generating=1`);}} /></div></section>

    {flashcardDraft ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" role="presentation" onClick={() => setFlashcardDraft(null)}><section role="dialog" aria-modal="true" aria-labelledby="new-flashcard-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-card" onClick={(event) => event.stopPropagation()}><h2 id="new-flashcard-title" className="text-lg font-semibold">Add a {topics.find((topic) => topic.id === flashcardDraft.topicId)?.label} card</h2><label className="mt-4 block text-sm font-medium">Front<textarea rows={2} value={flashcardDraft.front} onChange={(event) => setFlashcardDraft({ ...flashcardDraft, front: event.target.value })} className="mt-1 w-full rounded-lg border border-border p-3"/></label><label className="mt-3 block text-sm font-medium">Back<textarea rows={3} value={flashcardDraft.back} onChange={(event) => setFlashcardDraft({ ...flashcardDraft, back: event.target.value })} className="mt-1 w-full rounded-lg border border-border p-3"/></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setFlashcardDraft(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button disabled={!flashcardDraft.front.trim() || !flashcardDraft.back.trim()} onClick={addFlashcard} className="rounded-lg bg-[#23644f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Save card</button></div></section></div> : null}
  </div>;
}

function SectionHeading({ kicker, title, detail }: { kicker: string; title: string; detail: string }) { return <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#317460]">{kicker}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted">{detail}</p></div>; }
