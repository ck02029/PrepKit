import assert from "node:assert/strict";
import test from "node:test";
import { chunkEvidence, retrieveEvidence } from "./evidence-retrieval.js";

test("per-kit evidence chunks keep stable source IDs and bounded overlapping passages", () => {
  const document = { id: "source-1", url: "https://example.com/jobs", title: "Jobs", sourceType: "company", content: `Frontend teams build React interfaces. ${"TypeScript components use strict types. ".repeat(60)}` };
  const chunks = chunkEvidence("kit-1", [document], 300, 40);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 300 && chunk.url === document.url && chunk.sourceId === document.id));
  assert.deepEqual(chunkEvidence("kit-1", [document], 300, 40).map((chunk) => chunk.id), chunks.map((chunk) => chunk.id));
  assert.notEqual(chunkEvidence("kit-2", [document], 300, 40)[0].id, chunks[0].id);
});

test("retrieval returns relevant passages with citations and excludes unrelated content", () => {
  const chunks = chunkEvidence("kit", [
    { id: "front", url: "https://example.com/frontend", title: "Frontend", sourceType: "company", content: "React frontend engineers build accessible browser interfaces and TypeScript components." },
    { id: "data", url: "https://example.com/data", title: "Data", sourceType: "company", content: "Data engineers build Spark pipelines, warehouse models, and batch ingestion systems." },
  ], 400, 20);
  const result = retrieveEvidence(chunks, "React TypeScript frontend interface");
  assert.deepEqual(result.map((chunk) => chunk.sourceId), ["front"]);
  assert.equal(result[0].url, "https://example.com/frontend");
});
