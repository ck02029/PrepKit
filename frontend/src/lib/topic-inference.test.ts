import assert from "node:assert/strict";
import test from "node:test";
import { inferPracticeTopics } from "./topic-inference.ts";

test("only suggests topic families supported by job-description evidence", () => {
  const topics = inferPracticeTopics("We build distributed systems on Kubernetes and mentor engineers.");
  assert.deepEqual(topics.map((topic) => topic.id), ["system-design", "cloud-devops", "behavioural"]);
  assert.ok(topics.every((topic) => topic.basis === "job_description" && topic.evidence?.length));
  assert.ok(!topics.some((topic) => topic.id === "dsa" || topic.id === "oop" || topic.id === "operating-systems"));
});

test("does not add broad default topics when the description has no matching detail", () => {
  assert.deepEqual(inferPracticeTopics("Own customer outcomes across a growing product team."), []);
});

test("uses requirement ids only when the requirement text matches the topic", () => {
  const [topic] = inferPracticeTopics("Design distributed systems.", [
    { id: "r1", text: "Design distributed systems", kind: "technical", priority: "must" },
    { id: "r2", text: "Mentor new engineers", kind: "behavioural", priority: "nice" },
  ]);
  assert.deepEqual(topic.requirement_ids, ["r1"]);
});
