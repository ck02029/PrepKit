import type { KitQuestion } from "./schema.ts";

export function markQuestionEdited(question: KitQuestion, patch: Partial<KitQuestion>): KitQuestion {
  return {
    ...question,
    ...patch,
    origin: question.origin === "generated" ? "edited" : question.origin,
    updatedAt: new Date().toISOString(),
  };
}
