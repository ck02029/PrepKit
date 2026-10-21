import assert from "node:assert/strict";
import test from "node:test";
import { generationProgressPercent, generationViewState } from "./generation-view-state.ts";

const base = { steps: [], sources: [], coverage: { uncovered_requirement_ids: [], passes: 0 } };

test("generation view covers skeleton, partial, quota warning, and failure states", () => {
  assert.equal(generationViewState(undefined, true), "skeleton");
  assert.equal(generationViewState({ ...base, status: "generating", steps: [
    { name:"overview",state:"done",detail:"" }, { name:"topics",state:"running",detail:"" },
  ] }, false), "partial");
  assert.equal(generationViewState({ ...base, status: "waiting_for_quota", message:"Waiting for provider quota", steps: [
    { name:"questions",state:"warning",detail:"Saved and queued" },
  ] }, false), "warning");
  assert.equal(generationViewState({ ...base, status: "generating", steps: [
    { name:"overview",state:"failed",detail:"Retry this section" },
  ] }, false), "warning");
  assert.equal(generationViewState({ ...base, status: "failed" }, false), "failed");
});

test("completed fallback sections count toward progress instead of leaving the bar at 88%", () => {
  const steps = [
    ...Array.from({ length: 7 }, () => ({ state: "done" as const })),
    { state: "warning" as const },
  ];
  assert.equal(generationProgressPercent(steps), 100);
  assert.equal(generationProgressPercent([{ state: "done" }, { state: "running" }]), 50);
  assert.equal(generationProgressPercent([]), 0);
});
