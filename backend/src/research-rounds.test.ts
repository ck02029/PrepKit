import test from "node:test";
import assert from "node:assert/strict";
import { isRoundApplicableToCompany, matchesRole, roleFamilyFor, roleLevelInterviewQuery, roundsFromCandidateReports } from "./research.js";

test("recognizes common Software Development Engineer title variants for role research", () => {
  const role = "Software Dev Engineer I, Amazon University Talent Acquisition";
  assert.equal(roleFamilyFor(role)?.id, "software-engineering");
  assert.match(roleLevelInterviewQuery(role), /software development engineer/i);
});

test("candidate report fallback only emits stages explicitly present in report evidence", () => {
  const result = roundsFromCandidateReports([
    { title: "Amazon SDE interview experience", url: "https://reports.example/amazon-sde", text: "Cleared the online assessment, then had DSA and Leadership Principles questions with a hiring manager.", date: "", points: 0, scope: "company_specific" },
  ], "Amazon");

  assert.deepEqual(result.rounds.map((round) => round.name), [
    "Online assessment (OA)",
    "DSA and coding interview",
    "Leadership Principles interview",
    "Hiring manager discussion",
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

test("Amazon-specific interview formats are not attributed to Netflix", () => {
  const result = roundsFromCandidateReports([
    { title: "Netflix interview experience", url: "https://reports.example/netflix", text: "Behavioral questions, Amazon Leadership Principles, and a Bar Raiser discussion.", date: "", points: 0, scope: "company_specific" },
  ], "Netflix");

  assert.deepEqual(result.rounds.map((round) => round.name), ["Behavioral interview"]);
  assert.equal(isRoundApplicableToCompany({ name: "Bar Raiser discussion", description: "Amazon-specific interview stage." }, "Netflix"), false);
  assert.equal(isRoundApplicableToCompany({ name: "Leadership Principles interview", description: "Questions about Amazon Leadership Principles." }, "Netflix"), false);
  assert.equal(isRoundApplicableToCompany({ name: "Leadership Principles interview", description: "Questions about Amazon Leadership Principles." }, "Amazon"), true);
});

test("role search requires the actual role family, not one shared generic word", () => {
  const role = "Technical Operations Manager, Post Services - India Mumbai, India";
  assert.equal(matchesRole({ title: "Netflix Interview Questions", text: "A guide for operations roles, technical screens, and managers.", url: "https://example.com/netflix" }, role), false);
  assert.equal(matchesRole({ title: "Technical Operations Manager interview experience", text: "Candidate report for Netflix Post Services.", url: "https://example.com/report" }, role), true);
  assert.equal(matchesRole({ title: "Data Analyst interview experience", text: "SQL and reporting interview.", url: "https://example.com/report" }, "Senior Data Analyst"), true);
});
