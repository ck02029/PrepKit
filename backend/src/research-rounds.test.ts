import test from "node:test";
import assert from "node:assert/strict";
import { roundsFromCandidateReports } from "./research.js";

test("candidate report fallback only emits stages explicitly present in report evidence", () => {
  const result = roundsFromCandidateReports([
    { title: "Amazon SDE interview experience", url: "https://reports.example/amazon-sde", text: "Cleared the online assessment, then had DSA and Leadership Principles questions with a hiring manager.", date: "", points: 0, scope: "company_specific" },
  ], "Amazon");

  assert.deepEqual(result.rounds.map((round) => round.name), [
    "Online assessment (OA)",
    "DSA and coding interview",
    "Leadership Principles and behavioral",
    "Hiring manager or Bar Raiser discussion",
  ]);
  assert.ok(result.rounds.every((round) => round.sources[0] === "https://reports.example/amazon-sde"));
  assert.match(result.summary, /anecdotal examples/i);
  assert.match(result.summary, /omitted by role, level, location, and team/i);
});

test("candidate report fallback leaves unsupported round types out", () => {
  const result = roundsFromCandidateReports([
    { title: "Amazon SDE coding interview", url: "https://reports.example/amazon-coding", text: "Two coding questions focused on arrays and graphs.", date: "", points: 0, scope: "company_specific" },
  ], "Amazon");

  assert.deepEqual(result.rounds.map((round) => round.name), ["DSA and coding interview"]);
  assert.ok(!result.rounds.some((round) => /design|manager|behavioral/i.test(round.name)));
});
