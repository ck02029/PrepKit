import assert from "node:assert/strict";
import test from "node:test";
import { saveErrorState } from "./save-error-state.ts";

test("autosave reports optimistic concurrency conflicts separately from ordinary failures", () => {
  assert.equal(saveErrorState(Object.assign(new Error("changed"), { status: 409 })), "conflict");
  assert.equal(saveErrorState(Object.assign(new Error("server"), { status: 500 })), "error");
  assert.equal(saveErrorState(new Error("offline")), "error");
});
