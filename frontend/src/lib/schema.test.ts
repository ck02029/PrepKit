import assert from "node:assert/strict";
import test from "node:test";
import { kitDataSchema, kitGenerationInputSchema, kitGenerationOutputSchema } from "./schema.ts";

const validKit = {
  source: { company: "Example Co", company_url: "https://example.com", role: "Engineer", location: "Remote", jd_chars: 300, researched_at: "2026-10-19T00:00:00.000Z", pages_used: [] },
  company_brief: { summary: "Summary", what_they_do: "Builds software", sources: [], origin: "generated", updatedAt: "2026-10-19T00:00:00.000Z" },
  role: { title: "Engineer", seniority: "Mid", responsibilities: ["Build systems"], requirements: [{ id: "r1", text: "Write TypeScript", kind: "technical", priority: "must" }] },
  questions: [{ id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "How do you test?", answer_outline: "Discuss tradeoffs", difficulty: 2, origin: "generated", updatedAt: "2026-10-19T00:00:00.000Z" }],
  flashcards: [{ id: "f1", front: "What is a test?", back: "A check", requirement_ids: ["r1"], origin: "user", updatedAt: "2026-10-19T00:00:00.000Z" }],
  schedule: { days_available: 1, days: [{ day: 1, focus: "Review tests", question_ids: ["q1"], minutes: 30 }] },
  coverage: { uncovered_requirement_ids: [], passes: 1 },
};

test("parses a valid kit", () => {
  const result = kitDataSchema.safeParse(validKit);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.interview_research, {
      status: "pending",
      summary: "",
      topics: [],
      expected_round_count: null,
      rounds: [],
    });
    assert.deepEqual(result.data.round_progress, {
      expected_round_count: null,
      completed_rounds: [],
      current_round: "",
    });
  }
});

test("rejects invalid requirement kinds and question difficulty", () => {
  const invalidKit = {
    ...validKit,
    role: { ...validKit.role, requirements: [{ ...validKit.role.requirements[0], kind: "leadership" }] },
    questions: [{ ...validKit.questions[0], difficulty: 4 }],
  };

  const result = kitDataSchema.safeParse(invalidKit);
  assert.equal(result.success, false);
});

test("rejects unsupported interview topic frequency values", () => {
  const invalidKit = {
    ...validKit,
    interview_research: {
      status: "researched",
      summary: "Interview focus",
      topics: [{ id: "t1", label: "TypeScript", description: "", frequency: "weak", confidence: null, requirement_ids: ["r1"], sources: [] }],
      expected_round_count: null,
      rounds: [],
      completed_rounds: [],
      current_round: "",
    },
  };

  assert.equal(kitDataSchema.safeParse(invalidKit).success, false);
});

test("accepts the backend generation request shape and defaults optional job description", () => {
  const result = kitGenerationInputSchema.parse({ company: "Example Co", role: "Senior Platform Engineer", days_available: 7 });
  assert.equal(result.job_description, "");
  assert.equal(result.skip_company_research, undefined);
});

test("validates provenance and verified external links in generated output", () => {
  const topic = {
    id: "systems", label: "Distributed systems", description: "Role focus", subtopics: ["Reliability"], requirement_ids: ["r1"],
    learning_resources: [{ label: "Guide", url: "https://example.com/guide" }], basis: "job_description", rationale: "Explicit JD match", evidence: ["Design distributed systems"], confidence: "medium",
  };
  const result = kitGenerationOutputSchema.safeParse({
    role: validKit.role,
    practice_topics: [topic],
    interview_research: { status: "researched", summary: "Reported interview information", topics: [], expected_round_count: 1, rounds: [] },
    questions: [{ ...validKit.questions[0], practice_type: "coding", coding_links: [{ kind: "problem", label: "Example problem", url: "https://leetcode.com/problems/two-sum/", verified: true }] }],
  });
  assert.equal(result.success, true);
});
