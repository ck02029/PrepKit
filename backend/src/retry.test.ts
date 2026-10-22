import assert from "node:assert/strict";
import test from "node:test";
import { isTransientGenerationError, retryDelayMs, retryWithinDeadline, TransientGenerationError } from "./retry.js";

test("transient errors retry with capped increasing delays", () => {
  assert.deepEqual([1, 2, 3, 8].map((attempt) => retryDelayMs(attempt)), [1_000, 2_000, 4_000, 60_000]);
  assert.equal(isTransientGenerationError(new TransientGenerationError("temporary")), true);
  assert.equal(isTransientGenerationError(Object.assign(new Error("connection reset"), { code: "ECONNRESET" })), true);
  assert.equal(isTransientGenerationError(new SyntaxError("invalid JSON")), false);
});

test("batch retry waits for queued quota work and returns its completed result", async () => {
  let clock=0,attempts=0;
  const result=await retryWithinDeadline(async()=>++attempts===1?null:"kit",async()=>attempts===1?1_000:null,5_000,async(ms)=>{clock+=ms;},()=>clock);
  assert.equal(result,"kit");
  assert.equal(attempts,2);
  assert.equal(clock,1_000);
});

test("batch retry stops when the quota reset is beyond its deadline", async () => {
  let attempts=0;
  const result=await retryWithinDeadline(async()=>{attempts++;return null;},async()=>60_000,10_000,async()=>undefined,()=>0);
  assert.equal(result,null);
  assert.equal(attempts,1);
});
