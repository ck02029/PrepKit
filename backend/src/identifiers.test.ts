import assert from "node:assert/strict";
import test from "node:test";
import { stableId } from "./identifiers.js";

test("generated IDs are stable for the same content and scoped to a kit", () => {
  assert.equal(stableId("kit-a", "topic", "Arrays"), stableId("kit-a", "topic", " arrays "));
  assert.notEqual(stableId("kit-a", "topic", "Arrays"), stableId("kit-b", "topic", "Arrays"));
  assert.notEqual(stableId("kit-a", "topic", "Arrays"), stableId("kit-a", "question", "Arrays"));
  assert.match(stableId("kit-a", "topic", "Arrays"), /^[a-f0-9]{32}$/);
});
