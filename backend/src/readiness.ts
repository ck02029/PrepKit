type Requirement = { id: string; priority: string };
type PracticeItem = { id: string; requirement_ids: string[] };
type ReadinessKit = {
  role: { requirements: Requirement[] };
  questions: PracticeItem[];
  flashcards: PracticeItem[];
  schedule: { days: Array<{ question_ids: string[]; flashcard_ids?: string[]; requirement_ids?: string[] }>; warnings?: string[] };
};

export function kitReadiness(kit: ReadinessKit): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const must = kit.role.requirements.filter((item) => item.priority === "must");
  const scheduledQuestions = new Set(kit.schedule.days.flatMap((day) => day.question_ids));
  const scheduledCards = new Set(kit.schedule.days.flatMap((day) => day.flashcard_ids ?? []));
  for (const requirement of must) {
    if (!kit.questions.some((question) => question.requirement_ids.includes(requirement.id))) reasons.push(`Must-have requirement ${requirement.id} has no question coverage.`);
    if (!kit.schedule.days.some((day) => day.requirement_ids?.includes(requirement.id))) reasons.push(`Must-have requirement ${requirement.id} has no scheduled practice.`);
  }
  if (kit.questions.some((question) => !scheduledQuestions.has(question.id))) reasons.push("Some questions are missing from the schedule.");
  if (kit.flashcards.some((card) => !scheduledCards.has(card.id))) reasons.push("Some flashcards are missing from the schedule.");
  if (kit.schedule.warnings?.length) reasons.push(...kit.schedule.warnings);
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] };
}
