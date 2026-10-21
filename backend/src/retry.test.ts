import assert from "node:assert/strict";
import test from "node:test";
import { isTransientGenerationError, retryDelayMs, TransientGenerationError } from "./retry.js";

test("transient errors retry with capped increasing delays", () => {
  assert.deepEqual([1, 2, 3, 8].map((attempt) => retryDelayMs(attempt)), [1_000, 2_000, 4_000, 60_000]);
  assert.equal(isTransientGenerationError(new TransientGenerationError("temporary")), true);
  assert.equal(isTransientGenerationError(Object.assign(new Error("connection reset"), { code: "ECONNRESET" })), true);
  assert.equal(isTransientGenerationError(new SyntaxError("invalid JSON")), false);
});
