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
  const scheduledQuestions = new Set(kit.schedule.days.flatMap((day) => day.question_ids));
  const scheduledCards = new Set(kit.schedule.days.flatMap((day) => day.flashcard_ids ?? []));
  if (kit.questions.some((question) => !scheduledQuestions.has(question.id))) reasons.push("Some questions are missing from the schedule.");
  if (kit.flashcards.some((card) => !scheduledCards.has(card.id))) reasons.push("Some flashcards are missing from the schedule.");
  if (kit.schedule.warnings?.length) reasons.push(...kit.schedule.warnings);
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] };
}
