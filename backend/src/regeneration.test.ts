import assert from "node:assert/strict";
import test from "node:test";
import { mergeRegeneratedCategory, mergeRegeneratedItems } from "./regeneration.js";

type Item = { id: string; prompt: string; origin: "edited" | "generated"; progress?: { answer: string; rating: number } };

test("regeneration keeps user-edited IDs and their content unchanged", () => {
  const edited: Item = { id: "q1", prompt: "My edited prompt", origin: "edited" };
  const generated: Item = { id: "q1", prompt: "Model rewrite", origin: "generated" };
  const result = mergeRegeneratedItems<Item>([edited], [generated]);
  assert.deepEqual(result.active, [edited]);
  assert.deepEqual(result.archived, []);
});

test("removed generated items are archived while prior progress data stays attached", () => {
  const removed: Item = { id: "q-old", prompt: "Old prompt", origin: "generated", progress: { answer: "my answer", rating: 4 } };
  const generated: Item = { id: "q-new", prompt: "New prompt", origin: "generated" };
  const result = mergeRegeneratedItems<Item>([removed], [generated]);
  assert.deepEqual(result.archived, [removed]);
  assert.deepEqual(result.active.map((item) => item.id), ["q-new"]);
});

test("category regeneration replaces only untouched drafts in that category", () => {
  const previous = [
    { id: "t1", category: "technical", prompt: "Old technical", origin: "generated" as const },
    { id: "b1", category: "behavioural", prompt: "Existing behavioural", origin: "generated" as const },
    { id: "t2", category: "technical", prompt: "Pinned technical", origin: "edited" as const },
  ];
  const replacement = { id: "t3", category: "technical", prompt: "New technical", origin: "generated" as const };
  const result = mergeRegeneratedCategory(previous, [replacement], "technical");
  assert.deepEqual(result.active.map((item) => item.id), ["b1", "t3", "t2"]);
  assert.deepEqual(result.archived.map((item) => item.id), ["t1"]);
});
