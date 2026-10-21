import assert from "node:assert/strict";
import test from "node:test";
import { validateKitData } from "./kit-data-schema.js";

function validKit() {
  const requirement = { id: "req-1", text: "Build TypeScript APIs", kind: "technical", priority: "must", evidence_quote: "Build TypeScript APIs", provenance: "researched" };
  const topic = { id: "topic-1", label: "TypeScript APIs", description: "API design", subtopics: [], requirement_ids: ["req-1"], learning_resources: [] };
  const question = { id: "question-1", requirement_ids: ["req-1"], topic_ids: ["topic-1"], category: "technical", prompt: "How would you design an API?", answer_outline: "Discuss contracts and validation.", difficulty: 2, origin: "generated", updatedAt: "2026-10-19T00:00:00.000Z" };
  const flashcard = { id: "card-1", front: "What is an API contract?", back: "The agreed request and response shape.", requirement_ids: ["req-1"], topic_ids: ["topic-1"], origin: "generated", updatedAt: "2026-10-19T00:00:00.000Z" };
  return {
    source: { company: "Example", company_url: "", role: "Backend Engineer", location: "", jd_chars: 20, researched_at: "2026-10-19T00:00:00.000Z", pages_used: [] },
    company_brief: { summary: "", what_they_do: "", sources: [], origin: "generated", updatedAt: "2026-10-19T00:00:00.000Z" },
    interview_research: { status: "unavailable", summary: "", topics: [], expected_round_count: null, rounds: [] },
    round_progress: { expected_round_count: null, completed_rounds: [], current_round: "" },
    role: { title: "Backend Engineer", seniority: "", responsibilities: [], requirements: [requirement] },
    questions: [question], practice_topics: [topic], flashcards: [flashcard],
    schedule: { days_available: 2, days: [
      { day: 1, focus: "TypeScript APIs", question_ids: ["question-1"], flashcard_ids: [], topic_ids: ["topic-1"], requirement_ids: ["req-1"], minutes: 15 },
      { day: 2, focus: "Review", question_ids: [], flashcard_ids: ["card-1"], topic_ids: ["topic-1"], requirement_ids: ["req-1"], minutes: 5 },
    ], warnings: [] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

test("valid kit IDs and cross references are accepted", () => {
  assert.equal(validateKitData(validKit()).questions[0].id, "question-1");
});

test("duplicate IDs, dangling references, and malformed kits are rejected", () => {
  const duplicate = validKit() as any;
  duplicate.questions.push({ ...duplicate.questions[0] });
  assert.throws(() => validateKitData(duplicate), /duplicate IDs/);

  const dangling = validKit() as any;
  dangling.questions[0].requirement_ids = ["model-invented-requirement"];
  assert.throws(() => validateKitData(dangling), /unknown requirement/);

  const malformed = validKit() as any;
  malformed.schedule.days[0].minutes = 1.5;
  assert.throws(() => validateKitData(malformed));
});

test("a question or flashcard cannot appear on two schedule days", () => {
  const malformed = validKit() as any;
  malformed.schedule.days[1].question_ids = ["question-1"];
  assert.throws(() => validateKitData(malformed), /scheduled more than once/);
});
