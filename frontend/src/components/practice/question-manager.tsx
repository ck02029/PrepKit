"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { InlineEdit, OriginBadge } from "@/components/kits/editable-content";
import { markQuestionEdited } from "@/lib/kit-editing";
import type { KitData, KitQuestion } from "@/lib/schema";
import { useEffect, useState } from "react";

type Category = KitQuestion["category"];
type SaveState = "saved" | "saving" | "error" | "conflict";

const categories: Category[] = ["technical", "behavioural", "system-design", "company-fit"];
const categoryLabels: Record<Category, string> = { technical: "Technical", behavioural: "Behavioural", "system-design": "System design", "company-fit": "Company fit" };

function SortableQuestion({ question, onChange, onDelete, onPin, onMove }: { question: KitQuestion; onChange: (key: "prompt" | "answer_outline" | "practice_type" | "source_platform" | "source_url", value: string) => void; onDelete: () => void; onPin: () => void; onMove: (category: Category) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`border-b border-border py-4 ${isDragging ? "bg-[#f3f6f4]" : ""}`}>
    <div className="flex items-start gap-3"><button {...attributes} {...listeners} aria-label={`Reorder question: ${question.prompt}`} className="mt-1 min-h-10 min-w-8 cursor-grab text-muted">⠿</button><div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><OriginBadge origin={question.origin} /><span className="text-xs text-muted">Difficulty {question.difficulty}/3</span></div>
      <InlineEdit value={question.prompt} label="Question prompt" onCommit={(value) => onChange("prompt", value)} className="mt-2 block font-medium" />
      <div className="mt-1 text-sm text-muted"><InlineEdit value={question.answer_outline} label="Answer outline" multiline onCommit={(value) => onChange("answer_outline", value)} /></div>
      <div className="mt-3 border-l-2 border-border pl-3">
        <label className="block text-xs font-medium">Response type<select value={question.practice_type ?? "interview"} onChange={(event) => onChange("practice_type", event.target.value)} className="mt-1 h-9 rounded border border-border bg-white px-2"><option value="interview">Interview prompt</option><option value="writing">Written answer</option><option value="coding">Coding problem</option></select></label>
        {question.practice_type === "coding" ? <div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium">Platform<input aria-label={`Coding platform for ${question.prompt}`} value={question.source_platform ?? ""} onChange={(event) => onChange("source_platform", event.target.value)} placeholder="e.g. LeetCode" className="mt-1 min-h-9 w-full rounded border border-border px-2 text-sm" /></label><label className="text-xs font-medium">Original problem URL<input type="url" aria-label={`Original problem URL for ${question.prompt}`} value={question.source_url ?? ""} onChange={(event) => onChange("source_url", event.target.value)} placeholder="https://…" className="mt-1 min-h-9 w-full rounded border border-border px-2 text-sm" /></label>{question.source_url && safeHttpUrl(question.source_url) ? <a className="text-sm text-accent underline sm:col-span-2" href={safeHttpUrl(question.source_url)!} target="_blank" rel="noreferrer">Open problem{question.source_platform ? ` on ${question.source_platform}` : ""}</a> : <p className="text-xs text-muted sm:col-span-2">No source link attached. PrepKit does not run code; practise on a coding platform of your choice.</p>}</div> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><select aria-label="Move question to category" value={question.category} onChange={(event) => onMove(event.target.value as Category)} className="h-9 rounded border border-border bg-white px-2 text-xs"><option value="technical">Move to: Technical</option><option value="behavioural">Move to: Behavioural</option><option value="system-design">Move to: System design</option><option value="company-fit">Move to: Company fit</option></select><Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={onPin}>{question.origin === "pinned" ? "Unpin" : "Pin"}</Button><Button variant="ghost" className="min-h-9 px-2 text-xs text-danger" onClick={onDelete}>Delete</Button></div>
    </div></div>
  </li>;
}

function safeHttpUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
}

export function QuestionManager({ data, onUpdate, saveState, onRetry, onRegenerate }: { data: KitData; onUpdate: (next: KitData) => void; saveState: SaveState; onRetry: () => Promise<boolean>; onRegenerate?: (category: Category) => Promise<void> }) {
  const [category, setCategory] = useState<Category>("technical");
  const [questionDialog, setQuestionDialog] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [practiceType, setPracticeType] = useState<"interview" | "coding" | "writing">("interview");
  const [topicId, setTopicId] = useState("");
  const [roundName, setRoundName] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const [regenerate, setRegenerate] = useState<Category | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [snapshot, setSnapshot] = useState<KitData | null>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const visibleQuestions = data.questions.filter((question) => question.category === category);

  useEffect(() => {
    if (!questionDialog && !regenerate) return;
    const titleId = questionDialog ? "add-question-title" : "regenerate-title";
    const dialog = document.getElementById(titleId)?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]'));
    getFocusable()[0]?.focus();
    function trapDialogKeys(event: KeyboardEvent) {
      if (event.key === "Escape") { setQuestionDialog(false); setRegenerate(null); return; }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    }
    document.addEventListener("keydown", trapDialogKeys);
    return () => { document.removeEventListener("keydown", trapDialogKeys); if (previous?.isConnected) previous.focus(); };
  }, [questionDialog, regenerate]);

  function update(next: KitData) { onUpdate(next); }
  function updateQuestion(id: string, patch: Partial<KitQuestion>) {
    update({ ...data, questions: data.questions.map((question) => question.id === id ? markQuestionEdited(question, patch) : question) });
  }
  function deleteQuestion(id: string) {
    const previous = data;
    update({ ...data, questions: data.questions.filter((question) => question.id !== id) });
    setUndo(() => () => onUpdate(previous));
    setToast("Question deleted");
    window.setTimeout(() => { setToast(""); setUndo(null); }, 6000);
  }
  function reorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = visibleQuestions.findIndex((question) => question.id === event.active.id);
    const newIndex = visibleQuestions.findIndex((question) => question.id === event.over?.id);
    const reordered = arrayMove(visibleQuestions, oldIndex, newIndex);
    let index = 0;
    update({ ...data, questions: data.questions.map((question) => question.category === category ? reordered[index++] : question) });
  }
  function addQuestion() {
    if (!prompt.trim()) return;
    const now = new Date().toISOString();
    const added: KitQuestion = { id: `q_${Date.now()}`, requirement_ids: requirements, topic_ids: topicId ? [topicId] : [], category, practice_type: practiceType, source_platform: practiceType === "coding" ? sourcePlatform.trim() || null : null, source_url: practiceType === "coding" ? sourceUrl.trim() || null : null, round_name: roundName.trim() || null, prompt: prompt.trim(), answer_outline: answer.trim(), difficulty: 1, origin: "user", updatedAt: now };
    update({ ...data, questions: [...data.questions, added] });
    setPrompt(""); setAnswer(""); setRequirements([]); setPracticeType("interview"); setTopicId(""); setRoundName(""); setSourcePlatform(""); setSourceUrl(""); setQuestionDialog(false);
  }
  function beginRegenerate() { setRegenerate(category); setSnapshot(data); }
  async function runRegenerate() {
    if (!regenerate) return;
    setRegenerate(null);
    setRegenerating(true);
    if (onRegenerate) {
      const saved = await onRetry();
      if (!saved) { setToast("Save your edits before regenerating."); setRegenerating(false); return; }
      try { await onRegenerate(regenerate); setToast("Regeneration queued. Your saved edits will be kept."); }
      catch { setToast("Could not queue regeneration. Try again shortly."); }
      finally { setRegenerating(false); }
      return;
    }
    setToast("Question regeneration is unavailable. Try again when the API is connected.");
    setRegenerating(false);
  }
  function undoRegenerate() {
    if (snapshot) { update(snapshot); setSnapshot(null); setToast(""); }
  }
  const keepCount = data.questions.filter((question) => question.category === regenerate && question.origin !== "generated").length;
  const replaceCount = data.questions.filter((question) => question.category === regenerate && question.origin === "generated").length;

  return <section aria-labelledby="question-manager-heading" className="border-y border-border py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="question-manager-heading" className="text-lg font-semibold">Practice questions</h2><p className="mt-1 text-sm text-muted">Role-specific practice prompts are saved with your kit. Previously reported questions are labeled with their source.</p></div><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted" role="status" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : saveState === "conflict" ? "Save conflict" : "Saved"}</span>{saveState === "error" || saveState === "conflict" ? <button type="button" className="text-xs text-accent underline" onClick={onRetry}>Retry save</button> : null}<Button onClick={() => setQuestionDialog(true)}>+ Add a question</Button></div></div>
    <div className="mt-3 flex flex-wrap gap-1 border-b border-border">{categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`border-b-2 px-3 py-2 text-sm ${category === item ? "border-accent font-semibold text-accent" : "border-transparent text-muted"}`}>{categoryLabels[item]} <span className="font-mono text-xs">{data.questions.filter((question) => question.category === item).length}</span></button>)}</div>
    <p className="mt-3 text-sm text-muted">Saved question prompts for this category.</p>
    <div className={regenerating ? "mt-2 animate-pulse opacity-50" : "mt-2"}><div className="flex justify-end py-2"><Button variant="secondary" disabled={regenerating || !onRegenerate} onClick={beginRegenerate}>Regenerate {categoryLabels[category].toLowerCase()}</Button></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}><SortableContext items={visibleQuestions.map((question) => question.id)} strategy={verticalListSortingStrategy}><ul className="list-none">{visibleQuestions.map((question) => <SortableQuestion key={question.id} question={question} onChange={(key, value) => updateQuestion(question.id, key === "practice_type" ? { practice_type: value === "coding" || value === "writing" ? value : "interview" } : { [key]: value })} onDelete={() => deleteQuestion(question.id)} onPin={() => updateQuestion(question.id, { origin: question.origin === "pinned" ? "edited" : "pinned" })} onMove={(nextCategory) => updateQuestion(question.id, { category: nextCategory })} />)}</ul></SortableContext></DndContext>{visibleQuestions.length === 0 ? <p className="py-6 text-sm text-muted">No practice questions in this category yet.</p> : null}</div>
    {toast ? <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 border border-border bg-white px-4 py-3 text-sm shadow-card">{toast}{undo ? <button type="button" className="font-semibold text-accent underline" onClick={() => { undo(); setUndo(null); setToast(""); }}>Undo</button> : snapshot && !regenerate ? <button type="button" className="font-semibold text-accent underline" onClick={undoRegenerate}>Undo</button> : null}</div> : null}
    {questionDialog ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" role="presentation" onClick={() => setQuestionDialog(false)}><section role="dialog" aria-modal="true" aria-labelledby="add-question-title" className="w-full max-w-lg border border-border bg-white p-5 shadow-overlay" onClick={(event) => event.stopPropagation()}><h2 id="add-question-title" className="text-lg font-semibold">Add a question</h2><label className="mt-4 block text-sm font-medium">Category<select value={category} onChange={(event) => setCategory(event.target.value as Category)} className="mt-1 h-10 w-full rounded border border-border px-2">{categories.map((item) => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select></label><label className="mt-3 block text-sm font-medium">Response type<select value={practiceType} onChange={(event) => setPracticeType(event.target.value as typeof practiceType)} className="mt-1 h-10 w-full rounded border border-border px-2"><option value="interview">Interview prompt</option><option value="writing">Written answer</option><option value="coding">Coding problem</option></select></label><label className="mt-3 block text-sm font-medium">Topic<select value={topicId} onChange={(event) => setTopicId(event.target.value)} className="mt-1 h-10 w-full rounded border border-border px-2"><option value="">No topic</option>{data.practice_topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}</select></label><label className="mt-3 block text-sm font-medium">Interview round<input value={roundName} onChange={(event) => setRoundName(event.target.value)} placeholder="e.g. Technical problem solving" className="mt-1 h-10 w-full rounded border border-border px-2" /></label><label className="mt-3 block text-sm font-medium">Prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} className="mt-1 w-full rounded border border-border p-2" /></label><label className="mt-3 block text-sm font-medium">Answer outline <span className="font-normal text-muted">(optional)</span><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} className="mt-1 w-full rounded border border-border p-2" /></label>{practiceType === "coding" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Platform (optional)<input value={sourcePlatform} onChange={(event) => setSourcePlatform(event.target.value)} placeholder="e.g. LeetCode" className="mt-1 min-h-10 w-full rounded border border-border px-2" /></label><label className="text-sm font-medium">Original problem URL (optional)<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" className="mt-1 min-h-10 w-full rounded border border-border px-2" /></label></div> : null}<fieldset className="mt-3"><legend className="text-sm font-medium">Requirements</legend><div className="mt-2 flex flex-wrap gap-2">{data.role.requirements.map((item) => <label key={item.id} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={requirements.includes(item.id)} onChange={(event) => setRequirements((old) => event.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id))} />{item.text}</label>)}</div></fieldset><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setQuestionDialog(false)}>Cancel</Button><Button onClick={addQuestion} disabled={!prompt.trim()}>Add question</Button></div></section></div> : null}
    {regenerate ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" role="presentation" onClick={() => setRegenerate(null)}><section role="dialog" aria-modal="true" aria-labelledby="regenerate-title" className="w-full max-w-md border border-border bg-white p-5 shadow-overlay" onClick={(event) => event.stopPropagation()}><h2 id="regenerate-title" className="text-lg font-semibold">Regenerate {categoryLabels[regenerate].toLowerCase()} questions?</h2><p className="mt-3 text-sm text-muted">Kept: {keepCount} pinned, edited, or yours. Replaced: {replaceCount} untouched generated drafts.</p><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setRegenerate(null)}>Cancel</Button><Button onClick={runRegenerate}>Regenerate</Button></div></section></div> : null}
  </section>;
}
