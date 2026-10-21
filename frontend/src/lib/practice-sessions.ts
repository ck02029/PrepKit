import { backendBaseUrl } from "@/lib/backend-api";
import { apiFetch } from "@/lib/api-client";

export type PracticeSessionKind = "practice" | "daily";
export type SavedPracticeSession = {
  id: string;
  kitId: string;
  kind: PracticeSessionKind;
  label: string;
  questionIds: string[];
  flashcardIds: string[];
  topicId?: string;
  roundName?: string;
  day?: number;
  currentIndex: number;
  answers: Record<string, string>;
  ratings: Record<string, number>;
  revealedIds?: string[];
  createdAt: string;
  completedAt?: string;
  scorePercent?: number;
  status?: "in_progress" | "completed" | "abandoned";
};

export function savePracticeSession(session: SavedPracticeSession): Promise<void> {
  if (backendBaseUrl() === null) return Promise.reject(new Error("Saving practice sessions requires the PrepKit API."));
  return persistPracticeSession(session);
}

const knownRemote = new Set<string>();
const writes = new Map<string, Promise<void>>();

export async function syncPracticeSessions(kitId: string): Promise<SavedPracticeSession[]> {
  const base = backendBaseUrl();
  if (base === null) throw new Error("Loading practice sessions requires the PrepKit API.");
  try {
    const response = await apiFetch(`${base}/api/kits/${encodeURIComponent(kitId)}/practice/sessions`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Practice sessions could not be loaded from the server.");
    }
    const body = await response.json() as { sessions: SavedPracticeSession[] };
    for (const session of body.sessions) knownRemote.add(session.id);
    return body.sessions;
  } catch (error) {
    throw error;
  }
}

async function persistPracticeSession(session: SavedPracticeSession) {
  const base = backendBaseUrl();
  if (base === null) return;
  const previous = writes.get(session.id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const path = `${base}/api/kits/${encodeURIComponent(session.kitId)}/practice/sessions`;
    if (!knownRemote.has(session.id)) {
      const questions = session.questionIds.map((id) => ({ type: "question" as const, id }));
      const cards = session.flashcardIds.map((id) => ({ type: "flashcard" as const, id }));
      const items = session.kind === "daily" ? [...cards, ...questions] : [...questions, ...cards];
      const created = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: session.id, kind: session.kind, label: session.label, schedule_day: session.day, topic_id: session.topicId, round_name: session.roundName, currentIndex: session.currentIndex, items }) });
      if (!created.ok) throw new Error("Practice session could not be saved.");
      knownRemote.add(session.id);
    }
    const responses = [...session.questionIds, ...session.flashcardIds].map((item_id) => ({ item_id, answer: session.answers[item_id] ?? "", rating: session.ratings[item_id] ?? null, revealed: session.revealedIds?.includes(item_id) ?? Boolean(session.answers[item_id]), response_ms: 0 }));
    const saved = await apiFetch(`${path}/${encodeURIComponent(session.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentIndex: session.currentIndex, status: session.completedAt ? "completed" : "in_progress", responses }) });
    if (!saved.ok) throw new Error("Practice progress could not be saved.");
  });
  writes.set(session.id, next);
  try { await next; } finally { if (writes.get(session.id) === next) writes.delete(session.id); }
}

export function scoreSession(ratings: Record<string, number>, questionCount: number): number {
  if (!questionCount) return 0;
  const total = Object.values(ratings).reduce((sum, rating) => sum + Math.max(0, Math.min(4, rating - 1)), 0);
  return Math.round((total / (questionCount * 4)) * 100);
}
