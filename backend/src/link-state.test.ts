import assert from "node:assert/strict";
import test from "node:test";
import { nextLinkStatus } from "./link-state.js";

test("suggested links move to verified or failed only when the probe is conclusive", () => {
  assert.equal(nextLinkStatus("suggested", "reachable"), "verified");
  assert.equal(nextLinkStatus("suggested", "missing"), "failed");
  assert.equal(nextLinkStatus("suggested", "blocked_by_bot"), "suggested");
  assert.equal(nextLinkStatus("suggested", "temporary_error"), "suggested");
});

test("final link states do not silently transition", () => {
  assert.equal(nextLinkStatus("verified", "missing"), "verified");
  assert.equal(nextLinkStatus("failed", "reachable"), "failed");
});
