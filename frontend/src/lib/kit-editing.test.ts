import assert from "node:assert/strict";
import test from "node:test";
import { markQuestionEdited } from "./kit-editing.ts";
import type { KitQuestion } from "./schema.ts";

const generatedQuestion: KitQuestion = {
  id: "q1",
  requirement_ids: ["r1"],
  category: "technical",
  prompt: "Explain a design choice.",
  answer_outline: "Describe context and tradeoffs.",
  difficulty: 2,
  origin: "generated",
  updatedAt: "2026-10-19T00:00:00.000Z",
};

test("editing a generated question changes its origin to edited", () => {
  const edited = markQuestionEdited(generatedQuestion, { prompt: "Explain a different design choice." });

  assert.equal(edited.prompt, "Explain a different design choice.");
  assert.equal(edited.origin, "edited");
  assert.notEqual(edited.updatedAt, generatedQuestion.updatedAt);
});
