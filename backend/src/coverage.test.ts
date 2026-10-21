import assert from "node:assert/strict";
import test from "node:test";
import { generateWithCoverage, uncoveredMustRequirements } from "./coverage.js";

const requirements = [{ id: "must-1", priority: "must" as const }, { id: "must-2", priority: "must" as const }, { id: "nice-1", priority: "nice" as const }];

test("coverage identifies uncovered must requirements", () => {
  assert.deepEqual(uncoveredMustRequirements(requirements, [{ requirement_ids: ["must-1"] }]), ["must-2"]);
});

test("coverage second pass runs once and leaves unresolved gaps visible", async () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const result = await generateWithCoverage(requirements,
    async () => { firstCalls++; return [{ requirement_ids: ["must-1"] }]; },
    async (ids) => { secondCalls++; assert.deepEqual(ids, ["must-2"]); return []; },
  );
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
  assert.equal(result.passes, 2);
  assert.deepEqual(result.uncovered, ["must-2"]);
});

test("coverage does not run a needless second pass", async () => {
  let secondCalls = 0;
  const result = await generateWithCoverage(requirements,
    async () => [{ requirement_ids: ["must-1", "must-2"] }],
    async () => { secondCalls++; return []; },
  );
  assert.equal(secondCalls, 0);
  assert.equal(result.passes, 1);
  assert.deepEqual(result.uncovered, []);
});
