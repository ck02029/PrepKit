import assert from "node:assert/strict";
import test from "node:test";
import { nextQuestionSet } from "./practice-rotation.ts";

test("repeated practice sessions use unseen questions before repeating a set", () => {
  const pool = Array.from({ length: 12 }, (_, index) => `q${index + 1}`);
  const first = nextQuestionSet(pool, [], "Overall practice");
  const history = [{ label: "Overall practice", questionIds: first }];
  const second = nextQuestionSet(pool, history, "Overall practice");

  assert.equal(first.length, 5);
  assert.equal(second.length, 5);
  assert.equal(second.some((id) => first.includes(id)), false);
});

test("session rotation stays within the selected topic and separates histories", () => {
  const pool = ["a", "b", "c", "d", "e", "f"];
  const previous = [{ label: "API design session", questionIds: ["a", "b", "c", "d", "e"] }];

  assert.deepEqual(nextQuestionSet(pool, previous, "API design session"), ["f", "b", "c", "d", "e"]);
  assert.deepEqual(nextQuestionSet(pool, previous, "Database session"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(nextQuestionSet(["only-one"], previous, "API design session"), ["only-one"]);
});
