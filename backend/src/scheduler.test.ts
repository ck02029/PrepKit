import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { buildSchedule, preserveCompletedDays } from "./scheduler.js";

test("schedule properties hold for generated inputs", () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 30 }),
    fc.integer({ min: 15, max: 180 }),
    fc.array(fc.record({ type: fc.constantFrom("coding", "interview"), req: fc.integer({ min: 0, max: 3 }) }), { maxLength: 80 }),
    fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 80 }),
    (days, budget, questionInputs, cardInputs) => {
      const requirements = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, text: `requirement ${i}`, priority: i < 2 ? "must" as const : "nice" as const }));
      const questions = questionInputs.map((item, i) => ({ id: `q${i}`, practice_type: item.type as "coding" | "interview", requirement_ids: [`r${item.req}`], topic_ids: [] }));
      const cards = cardInputs.map((req, i) => ({ id: `c${i}`, requirement_ids: [`r${req}`], topic_ids: [] }));
      const plan = buildSchedule(days, questions, cards, budget, requirements, []);
      assert.equal(plan.days.length, days);
      assert.deepEqual(plan.days.map((day) => day.day), Array.from({ length: days }, (_, i) => i + 1));
      for (const day of plan.days) {
        assert.ok(Number.isInteger(day.minutes));
        assert.ok(day.minutes <= budget);
      }
      const assigned = plan.days.flatMap((day) => [...day.question_ids, ...day.flashcard_ids]);
      assert.equal(new Set(assigned).size, assigned.length, "no scheduled item appears twice");
      for (const id of [...questions, ...cards].map((item) => item.id)) {
        assert.ok(assigned.includes(id) || plan.warnings.some((warning) => warning.includes(id)), `unassigned content ${id} must have a warning`);
      }
    },
  ), { numRuns: 350 });
});

test("content longer than the budget is omitted with a warning", () => {
  const plan = buildSchedule(2, [{ id: "coding-1", practice_type: "coding", requirement_ids: ["r1"] }], [], 20,
    [{ id: "r1", text: "Algorithms", priority: "must" }], []);
  assert.deepEqual(plan.days.map((day) => day.minutes), [0, 0]);
  assert.ok(plan.warnings.some((warning) => warning.includes("coding-1")));
  assert.ok(plan.warnings.some((warning) => warning.includes("no scheduled practice")));
});

test("harder questions are scheduled before easier questions for the same requirement", () => {
  const plan=buildSchedule(2,[
    {id:"easy",difficulty:1,requirement_ids:["r1"]},
    {id:"hard",difficulty:3,requirement_ids:["r1"]},
  ],[],15,[{id:"r1",text:"System design",priority:"must"}],[]);
  assert.deepEqual(plan.days.map((day)=>day.question_ids),[["hard"],["easy"]]);
});

test("rebuilding a schedule retains completed day progress", () => {
  const days = [{ day: 1, focus: "Updated focus" }, { day: 2, focus: "New focus" }];
  const merged = preserveCompletedDays([
    { day: 1, status: "completed", completed_at: "2026-01-01T10:00:00Z" },
  ], days);
  assert.equal(merged[0].status, "completed");
  assert.equal(merged[0].completed_at, "2026-01-01T10:00:00Z");
  assert.equal(merged[1].status, "not_started");
});
