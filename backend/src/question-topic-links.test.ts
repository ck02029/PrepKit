import assert from "node:assert/strict";
import test from "node:test";
import { inferQuestionTopicIds, topicsForQuestionCategory } from "./question-topic-links.js";

const topics = [
  { id: "dsa", label: "Data structures and algorithms", subtopics: ["Arrays, graphs, and complexity"] },
  { id: "coding", label: "Coding implementation", subtopics: ["Write and explain runnable code", "Testing and debugging"] },
  { id: "cs", label: "Core computer science foundations", subtopics: ["Operating systems: processes, threads, memory", "Databases: indexes and transactions"] },
  { id: "lld", label: "Object-oriented and low-level design", subtopics: ["Classes, interfaces, and core entities", "Error handling and testability"] },
  { id: "hld", label: "Light system design (optional for entry-level)", subtopics: ["APIs, components, data flow, and storage", "Reliability and scaling"] },
  { id: "project-architecture", label: "Project architecture discussion (practice)", subtopics: ["Explain a real project you built"] },
  { id: "behavioral", label: "Behavioral and collaboration examples", subtopics: ["Feedback, teamwork, and truthful examples"] },
  { id: "sql", label: "SQL and data querying", subtopics: ["Joins, aggregation, and data quality"] },
  { id: "product-sense", label: "Product sense and user problems", subtopics: ["Clarify user needs and prioritize a solution"] },
  { id: "execution", label: "Execution and prioritization", subtopics: ["Milestones, risks, and dependencies"] },
];

test("software role topics activate the matching technical, design, behavior, and company-fit question generators", () => {
  assert.deepEqual(topicsForQuestionCategory("technical", topics).map((topic) => topic.id), ["dsa", "coding", "cs", "sql"]);
  assert.ok(topicsForQuestionCategory("system-design", topics).some((topic) => topic.id === "lld"));
  assert.ok(topicsForQuestionCategory("system-design", topics).some((topic) => topic.id === "hld"));
  assert.ok(topicsForQuestionCategory("behavioural", topics).some((topic) => topic.id === "behavioral"));
  assert.ok(topicsForQuestionCategory("company-fit", topics).some((topic) => topic.id === "behavioral"));
});

test("unlinked LLD and architecture questions receive the matching study topic", () => {
  assert.deepEqual(inferQuestionTopicIds("system-design", "Design classes and interfaces for a library checkout component.", topics), ["lld"]);
  assert.deepEqual(inferQuestionTopicIds("system-design", "Design an API service and explain data flow, storage, and scaling.", topics), ["hld"]);
  assert.deepEqual(inferQuestionTopicIds("system-design", "Choose a real project you built and walk through its architecture.", topics), ["project-architecture"]);
});

test("unlinked technical questions distinguish DSA from computer-science fundamentals", () => {
  assert.deepEqual(inferQuestionTopicIds("technical", "Explain how threads share memory and avoid race conditions.", topics), ["cs"]);
  assert.deepEqual(inferQuestionTopicIds("technical", "Find the shortest path in a graph and analyze complexity.", topics), ["dsa"]);
  assert.deepEqual(inferQuestionTopicIds("technical", "Implement a small parser and add unit tests for malformed input.", topics), ["coding"]);
});

test("company-fit practice can attach to the role's behavioral topic when no separate topic exists", () => {
  assert.deepEqual(inferQuestionTopicIds("company-fit", "Why this company and how would you collaborate with its engineering team?", topics), ["behavioral"]);
});

test("analytics and product role topics also trigger their relevant question categories", () => {
  assert.ok(topicsForQuestionCategory("technical", topics).some((topic) => topic.id === "sql"));
  assert.ok(topicsForQuestionCategory("company-fit", topics).some((topic) => topic.id === "product-sense"));
  assert.ok(topicsForQuestionCategory("behavioural", topics).some((topic) => topic.id === "execution"));
});
