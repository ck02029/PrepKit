type SessionHistory = { label: string; questionIds: string[] };

const QUESTIONS_PER_SESSION = 5;

/** Choose a different, least-recently-seen batch for repeated practice sessions. */
export function nextQuestionSet(
  questionIds: string[],
  history: SessionHistory[],
  label: string,
  limit = QUESTIONS_PER_SESSION,
) {
  const candidates = [...new Set(questionIds)];
  if (candidates.length <= 1) return candidates;

  const prior = history.filter((session) => session.label === label);
  const useCounts = new Map(candidates.map((id) => [id, 0]));
  const lastSeen = new Map(candidates.map((id) => [id, -1]));
  for (let index = prior.length - 1; index >= 0; index--) {
    for (const id of new Set(prior[index].questionIds)) {
      if (!useCounts.has(id)) continue;
      useCounts.set(id, (useCounts.get(id) ?? 0) + 1);
      lastSeen.set(id, index);
    }
  }

  // Rotate ties so a well-practiced pool does not settle back on its original order.
  const offset = prior.length % candidates.length;
  const rotatedRank = (id: string) => {
    const index = candidates.indexOf(id);
    return (index - offset + candidates.length) % candidates.length;
  };
  return candidates
    .sort((first, second) => (useCounts.get(first)! - useCounts.get(second)!)
      || (lastSeen.get(second)! - lastSeen.get(first)!)
      || rotatedRank(first) - rotatedRank(second))
    .slice(0, Math.min(Math.max(1, limit), candidates.length));
}
