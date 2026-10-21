import assert from "node:assert/strict";
import test from "node:test";
import { orderPracticeItems } from "./ordering.ts";

test("orders unseen first, then lowest confidence, must-have, and original order", () => {
  const result = orderPracticeItems([
    { id: "nice-rated", confidence: 2, priority: "nice", originalOrder: 0 },
    { id: "must-rated", confidence: 2, priority: "must", originalOrder: 3 },
    { id: "low-confidence", confidence: 1, priority: "nice", originalOrder: 1 },
    { id: "unseen-late", priority: "nice", originalOrder: 4 },
    { id: "unseen-early", priority: "must", originalOrder: 2 },
  ]);

  assert.deepEqual(result.map((item) => item.id), [
    "unseen-early",
    "unseen-late",
    "low-confidence",
    "must-rated",
    "nice-rated",
  ]);
});
