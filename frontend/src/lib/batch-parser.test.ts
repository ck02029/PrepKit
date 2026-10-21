import assert from "node:assert/strict";
import test from "node:test";
import { getBatchRowIssues, parseBatchCsv } from "./batch-parser.ts";

test("parses CSV rows and rejects a row with missing JD, invalid URL, and out-of-range days", () => {
  const [record] = parseBatchCsv("jd,company_url,days\n,ftp://example.com,61");
  const issues = getBatchRowIssues({
    id: "row1",
    role: "Backend Engineer",
    jd: record.jd,
    companyUrl: record.company_url,
    days: Number(record.days),
    expectedRounds: "",
    completedRounds: "",
    currentRound: "",
    checked: true,
  });

  assert.deepEqual(issues, [
    "Job description is required",
    "URL must use http(s)",
    "Days must be 1–60",
  ]);
});

test("rejects malformed company URLs on otherwise complete rows", () => {
  const issues = getBatchRowIssues({ id: "row2", role: "Backend Engineer", jd: "A valid role description", companyUrl: "not a URL", days: 3, expectedRounds: "", completedRounds: "", currentRound: "", checked: true });

  assert.deepEqual(issues, ["Company URL must be valid"]);
});

test("parses optional round columns and validates expected round count", () => {
  const [record] = parseBatchCsv("jd,expected_rounds,completed_rounds,current_round\nEngineer,5,Recruiter screen,Technical interview");

  assert.deepEqual(record, {
    jd: "Engineer",
    expected_rounds: "5",
    completed_rounds: "Recruiter screen",
    current_round: "Technical interview",
  });
  assert.deepEqual(getBatchRowIssues({ id: "row3", role: "Engineer", jd: "Engineer", companyUrl: "", days: 3, expectedRounds: "21", completedRounds: "", currentRound: "", checked: true }), ["Expected rounds must be 1–20"]);
});
