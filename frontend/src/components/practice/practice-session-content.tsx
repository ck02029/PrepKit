"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/error-state";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadKitData, regenerateKitSection } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { emptyKitData } from "@/lib/empty-kit";
import type { KitData, KitQuestion } from "@/lib/schema";
import { savePracticeSession, scoreSession, syncPracticeSessions, type SavedPracticeSession } from "@/lib/practice-sessions";

type Props = { kitId: string; sessionId: string };
function safeExternalUrl(value?: string | null) { try { const url = value ? new URL(value) : null; return url && ["https:", "http:"].includes(url.protocol) ? url.toString() : null; } catch { return null; } }

export function PracticeSessionContent({ kitId, sessionId }: Props) {
  const [session, setSession] = useState<SavedPracticeSession | null>(null);
  const [data, setData] = useState<KitData>(emptyKitData);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const router = useRouter();
  const saveRevision = useRef(0);
  const kitDataQuery = useQuery({ queryKey: queryKeys.kitData(kitId), queryFn: () => loadKitData(kitId) });
  useEffect(() => { if (kitDataQuery.data) setData(kitDataQuery.data.data); }, [kitDataQuery.data]);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setLoadError(false);
    void syncPracticeSessions(kitId)
      .then((sessions) => { if (!active) return; const restored=sessions.find((item) => item.id === sessionId) ?? null;setSession(restored);setRevealed(Boolean(restored?.revealedIds?.includes([...restored.questionIds,...restored.flashcardIds][restored.currentIndex]))); })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [kitId, sessionId]);

  const items = useMemo(() => {
    if (!session) return [];
    const questions = session.questionIds.map((id) => data.questions.find((item) => item.id === id) ?? data.archived_items?.questions.find((item) => item.id === id)).filter((item): item is KitQuestion => Boolean(item));
    const cards = session.flashcardIds.map((id) => data.flashcards.find((item) => item.id === id) ?? data.archived_items?.flashcards.find((item) => item.id === id)).filter(Boolean).map((card) => ({ id: card!.id, prompt: card!.front, answer_outline: card!.back, category: "flashcard", practice_type: "writing" as const, source_url: null, source_platform: null, round_name: null, isFlashcard: true }));
    const questionItems = questions.map((item) => ({ ...item, isFlashcard: false }));
    return session.kind === "daily" ? [...cards, ...questionItems] : [...questionItems, ...cards];
  }, [data, session]);

  async function persist(next: SavedPracticeSession) {
    const revision = ++saveRevision.current;
    setSaveState("saving");
    try {
      await savePracticeSession(next);
      if (revision === saveRevision.current) setSaveState("saved");
    } catch {
      if (revision === saveRevision.current) setSaveState("error");
    }
  }
  function update(next: SavedPracticeSession) { setSession(next); void persist(next); }
  function setAnswer(itemId: string, answer: string) { if (session) update({ ...session, answers: { ...session.answers, [itemId]: answer } }); }
  function setRating(itemId: string, rating: number) { if (session) update({ ...session, ratings: { ...session.ratings, [itemId]: rating } }); }
  function toggleReveal() { if(!session)return;const current=items[session.currentIndex]?.id;const next=!revealed;setRevealed(next);if(current)update({...session,revealedIds:next?[...new Set([...(session.revealedIds??[]),current])]:(session.revealedIds??[]).filter((id)=>id!==current)}); }
  function moveNext() { if (!session) return; update({ ...session, currentIndex: Math.min(session.currentIndex + 1, items.length - 1) }); setRevealed(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function movePrevious() { if (!session) return; update({ ...session, currentIndex: Math.max(session.currentIndex - 1, 0) }); setRevealed(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function finish() {
    if (!session || !items.every((entry) => session.ratings[entry.id] !== undefined)) return;
    update({ ...session, currentIndex: items.length, completedAt: new Date().toISOString(), scorePercent: scoreSession(session.ratings, items.length) });
  }
  async function generateMoreQuestions() {
    if (!session) return;
    setGeneratingQuestions(true);
    setGenerationError("");
    try {
      await regenerateKitSection(kitId, "questions", undefined, "append_fresh", session.id);
      router.push(`/kits/${kitId}?generating=1`);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "New questions could not be generated.");
      setGeneratingQuestions(false);
    }
  }

  if (!loaded || kitDataQuery.isPending) return <div aria-busy="true" className="mx-auto max-w-3xl animate-pulse space-y-4 py-8"><div className="h-10 rounded bg-[#e7e8e3]"/><div className="h-64 rounded-2xl bg-[#e7e8e3]"/></div>;
  if (kitDataQuery.isError || !kitDataQuery.data) return <main className="mx-auto max-w-4xl py-8"><ErrorState title="Practice session unavailable" message="PrepKit could not load this kit from the server." onRetry={() => void kitDataQuery.refetch()} /></main>;
  if (loadError) return <main className="mx-auto max-w-4xl py-8"><ErrorState title="Practice session unavailable" message="PrepKit could not load this session from the server. Try again when the API is available." onRetry={() => window.location.reload()} /></main>;
  if (!session) return <section className="mx-auto max-w-xl py-16 text-center"><h1 className="text-2xl font-semibold">Session not found</h1><p className="mt-2 text-sm text-muted">It may have been removed from this browser.</p><Link className="mt-5 inline-block text-[#23644f] underline" href={`/kits/${kitId}/practice`}>Back to Practice</Link></section>;
  if (!items.length) return <section className="mx-auto max-w-xl py-16 text-center"><h1 className="text-2xl font-semibold">No items in this session</h1><p className="mt-2 text-sm text-muted">Some of the questions may have been removed.</p><Link className="mt-5 inline-block text-[#23644f] underline" href={`/kits/${kitId}/practice`}>Back to Practice</Link></section>;
  const completed = Boolean(session.completedAt);
  if (completed) {
    return <main className="mx-auto max-w-3xl py-8"><Link href={`/kits/${kitId}/practice`} className="text-sm text-[#23644f] underline">← Practice</Link><section className="mt-5 rounded-3xl bg-[#153b33] p-7 text-white sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b3d9c9]">Session complete</p><h1 className="mt-2 text-3xl font-semibold">{session.label}</h1><p className="mt-3 text-5xl font-semibold">{session.scorePercent ?? 0}%</p><p className="mt-2 text-sm text-white/75">Self-assessed score from your saved confidence ratings.</p><p className="mt-2 text-xs text-white/75" role="status" aria-live="polite">{saveState === "saving" ? "Saving your results…" : saveState === "error" ? <>Results are not saved to the server. <button className="underline" onClick={() => void persist(session)}>Retry</button></> : "Results saved to your account"}</p><div className="mt-6 flex flex-wrap gap-3"><Link href={`/kits/${kitId}/practice`} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#153b33]">Start another session</Link><button onClick={() => void generateMoreQuestions()} disabled={generatingQuestions} className="rounded-xl border border-white/40 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{generatingQuestions ? "Generating new questions…" : "Generate more questions for this session"}</button>{session.kind === "daily" ? <Link href={`/kits/${kitId}/schedule`} className="rounded-xl border border-white/40 px-4 py-2.5 text-sm font-semibold text-white">Return to scheduler</Link> : null}</div>{generationError ? <p className="mt-3 text-sm text-red-200" role="alert">{generationError}</p> : null}{session.kind === "daily" ? <p className="mt-4 text-sm">Practice is saved separately. Mark this schedule day complete from the scheduler when you are ready.</p> : null}</section><h2 className="mt-7 text-lg font-semibold">Session answers</h2><ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-white px-5">{items.map((item, index) => <li key={item.id} className="py-4"><div className="flex items-start justify-between gap-4"><p className="font-medium">{index + 1}. {item.prompt}</p><span className="shrink-0 rounded-full bg-[#edf5f0] px-2.5 py-1 text-xs">Rating {session.ratings[item.id] ?? "—"}/5</span></div>{session.answers[item.id] ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{session.answers[item.id]}</p> : null}</li>)}</ul></main>;
  }

  const index = Math.min(session.currentIndex, items.length - 1);
  const item = items[index];
  const isFlashcard = "isFlashcard" in item && item.isFlashcard;
  const rating = session.ratings[item.id];
  const allRated = items.every((entry) => session.ratings[entry.id] !== undefined);
  return <main className="mx-auto max-w-4xl py-5 sm:py-8"><div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/kits/${kitId}/practice`} className="text-sm text-[#23644f] underline">← Save and leave session</Link><button onClick={() => void generateMoreQuestions()} disabled={generatingQuestions} className="min-h-10 rounded-lg border border-[#23644f] px-3 text-sm font-medium text-[#23644f] disabled:opacity-50">{generatingQuestions ? "Generating new questions…" : "Generate more questions for this session"}</button></div>{generationError ? <p className="mt-3 text-sm text-red-700" role="alert">{generationError}</p> : null}<header className="mt-5 rounded-3xl bg-[#153b33] p-6 text-white sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b3d9c9]">{session.kind === "daily" ? "Daily session" : session.topicId ? "Topic session" : session.roundName ? "Round session" : "Practice session"}</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold sm:text-3xl">{session.label}</h1><p className="mt-1 text-sm text-white/70">{"Progress is stored with your account."}</p><p className="mt-1 text-xs text-white/75" role="status" aria-live="polite">{saveState === "saving" ? "Saving progress…" : saveState === "error" ? <>Progress is not saved to the server. <button className="underline" onClick={() => void persist(session)}>Retry</button></> : "Saved to your account"}</p></div><span className="font-mono text-sm">{index + 1} / {items.length}</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#b3d9c9] transition-all" style={{ width: `${Math.round((index / items.length) * 100)}%` }}/></div></header>
    <section className="mt-5 rounded-3xl border border-border bg-white p-5 shadow-sm sm:p-8"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-[#edf5f0] px-3 py-1 text-xs font-medium text-[#23644f]">{isFlashcard ? "Flashcard" : item.category.replaceAll("-", " ")}{item.practice_type === "coding" ? " · Coding" : item.practice_type === "writing" ? " · Written response" : " · Interview prompt"}</span>{!isFlashcard && item.round_name ? <span className="text-xs text-muted">{item.round_name}</span> : null}</div><h2 className="mt-5 text-xl font-semibold leading-8">{item.prompt}</h2>
      {item.practice_type === "coding" && !isFlashcard ? <div className="mt-4 rounded-2xl bg-[#f2f5f2] p-4"><p className="text-sm font-medium">Coding workspace</p>{safeExternalUrl(item.source_url) ? <a className="mt-2 inline-block text-sm text-[#23644f] underline" href={safeExternalUrl(item.source_url)!} target="_blank" rel="noreferrer">Open original problem{item.source_platform ? ` on ${item.source_platform}` : ""} ↗</a> : <p className="mt-2 text-sm text-muted">No external problem link is attached.</p>}<p className="mt-1 text-xs text-muted">Code runs on the linked platform. Notes here are saved with this session.</p></div> : null}
      <label className="mt-5 block text-sm font-medium">{item.practice_type === "coding" ? "Approach, pseudocode, or work notes" : item.practice_type === "writing" ? "Your written answer" : isFlashcard ? "Recall notes (optional)" : "Your response"}<textarea rows={item.practice_type === "coding" ? 8 : 5} value={session.answers[item.id] ?? ""} onChange={(event) => setAnswer(item.id, event.target.value)} placeholder={item.practice_type === "coding" ? "Describe your approach and complexity…" : "Write your answer before revealing the outline…"} className="mt-2 w-full rounded-xl border border-border bg-[#fbfcfa] p-3 text-sm leading-6 focus:border-[#23644f] focus:outline-none"/></label>
      <div className="mt-5"><button onClick={toggleReveal} className="rounded-lg border border-border px-3 py-2 text-sm">{revealed ? "Hide answer outline" : isFlashcard ? "Reveal back" : "Reveal answer outline"}</button>{revealed ? <div className="mt-3 rounded-xl border-l-4 border-[#317460] bg-[#eff7f1] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#23644f]">Suggested answer</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.answer_outline}</p></div> : null}</div>
      <fieldset className="mt-6"><legend className="text-sm font-semibold">How well did your answer meet the key points?</legend><p className="mt-1 text-xs text-muted">Rate yourself from 1 (not yet) to 5 (strong). Daily session scores use this self-rating.</p><div className="mt-3 flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-pressed={rating === value} onClick={() => setRating(item.id, value)} className={`h-11 w-11 rounded-xl border text-sm font-semibold ${rating === value ? "border-[#23644f] bg-[#23644f] text-white" : "border-border bg-white hover:border-[#23644f]"}`}>{value}</button>)}</div></fieldset>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><p className="text-xs text-muted">{Object.keys(session.answers).length} answers saved · {Object.keys(session.ratings).length}/{items.length} rated</p>{!rating ? <p className="text-xs font-medium text-[#8a4b10]">Choose a rating to continue.</p> : index === items.length - 1 && !allRated ? <p className="text-xs font-medium text-[#8a4b10]">Go back and rate any skipped items before finishing.</p> : null}</div><div className="flex gap-2">{index > 0 ? <button onClick={movePrevious} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">← Previous</button> : null}{index < items.length - 1 ? <button onClick={moveNext} disabled={!rating} className="min-h-11 rounded-xl bg-[#23644f] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Next item →</button> : <button onClick={finish} disabled={!allRated} className="min-h-11 rounded-xl bg-[#23644f] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Finish session</button>}</div></div>
    </section></main>;
}
