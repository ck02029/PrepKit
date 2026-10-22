import test from "node:test";
import assert from "node:assert/strict";
import { topicHeading } from "./topic-heading.ts";

test("uses concise topic headings for long generic titles", () => {
  assert.equal(topicHeading("Role knowledge: human resources and recruiting"), "HR essentials");
  assert.equal(topicHeading("Practical human resources and recruiting scenarios"), "HR scenarios");
  assert.equal(topicHeading("forward deployed engineering fundamentals"), "FDE essentials");
  assert.equal(topicHeading("Experience and project discussion"), "Projects & impact");
});

test("shortens unknown long headings at a word boundary", () => {
  const heading = topicHeading("A very long automatically generated interview preparation topic title");
  assert.ok(heading.length <= 28);
  assert.ok(!heading.endsWith("…"));
});
