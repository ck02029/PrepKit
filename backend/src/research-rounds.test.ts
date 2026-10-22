import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeInterviewRounds, inferSeniorityLevel, isRoundApplicableToCompany, matchesRole, roleFamilyFor, roleLevelInterviewQuery, roundsFromCandidateReports } from "./research.js";

test("seniority inference does not treat every software role as entry-level", () => {
  assert.equal(inferSeniorityLevel("Software Dev Engineer I"), "Entry-level");
  assert.equal(inferSeniorityLevel("Senior Software Engineer"), "Senior / lead");
  assert.equal(inferSeniorityLevel("Staff Backend Engineer"), "Staff / principal");
  assert.equal(inferSeniorityLevel("Software Engineer II"), "Mid-level");
  assert.equal(inferSeniorityLevel("Backend Engineer", "Requires 5+ years of experience."), "Mid-level");
  assert.equal(inferSeniorityLevel("Data Scientist"), "Unspecified");
});

test("round names that describe the same stage are merged with combined evidence", () => {
  const result = canonicalizeInterviewRounds([
    { name: "DSA round", description: "Arrays and graphs.", sources: ["https://reports.example/1"] },
    { name: "Coding interview", description: "Live coding.", sources: ["https://reports.example/2"] },
    { name: "High-level design", description: "Scalable architecture.", sources: ["https://reports.example/3"] },
    { name: "Architecture interview", description: "System components.", sources: ["https://reports.example/4"] },
    { name: "Object-oriented design", description: "Class design.", sources: ["https://reports.example/5"] },
    { name: "LLD round", description: "Low-level design.", sources: ["https://reports.example/6"] },
    { name: "Leadership Principles round", description: "Principle-based stories.", sources: ["https://reports.example/7"] },
    { name: "Behavioral interview", description: "STAR examples.", sources: ["https://reports.example/8"] },
    { name: "Bar Raiser round", description: "Interviewer was a Bar Raiser.", sources: ["https://reports.example/9"] },
  ], "Amazon");

  assert.deepEqual(result.map((round) => round.name), [
    "DSA and coding interview",
    "System design",
    "Low-level design (LLD/OOD)",
    "Leadership Principles interview",
  ]);
  assert.equal(result[0]?.sources.length, 2);
  assert.equal(result[1]?.sources.length, 2);
  assert.equal(result[2]?.sources.length, 2);
  assert.equal(result[3]?.sources.length, 3);
  assert.match(result[3]?.description ?? "", /Bar Raiser.*does not by itself establish a separate interview stage/i);
});

test("behavioral aliases use a neutral canonical name outside Amazon", () => {
  const result = canonicalizeInterviewRounds([
    { name: "Competency-based interview", description: "Competency examples.", sources: ["https://reports.example/1"] },
    { name: "STAR round", description: "Behavioral stories.", sources: ["https://reports.example/2"] },
  ], "Contoso");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.name, "Behavioral interview");
  assert.equal(result[0]?.sources.length, 2);
});

test("recognizes common Software Development Engineer title variants for role research", () => {
  const role = "Software Dev Engineer I, Amazon University Talent Acquisition";
  assert.equal(roleFamilyFor(role)?.id, "software-engineering");
  assert.match(roleLevelInterviewQuery(role), /software development engineer/i);
  assert.match(roleLevelInterviewQuery("Senior Software Engineer"), /senior lead experienced/i);
  assert.match(roleLevelInterviewQuery("Software Engineer II"), /mid-level experienced/i);
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
