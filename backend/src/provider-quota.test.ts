import test from "node:test";
import assert from "node:assert/strict";
import { nextMidnight, providerKeyId, quotaDecision } from "./provider-quota.js";

test("a provider-supplied per-minute delay is honored", () => {
  const now = new Date("2026-10-21T10:00:00.000Z");
  const result = quotaDecision("gemini", new Headers({ "retry-after": "35" }), { error: { message: "per minute rate limit" } }, now);
  const seconds = (result.retryAt.getTime() - now.getTime()) / 1000;
  assert.ok(seconds >= 30 && seconds <= 40, `expected 30–40 seconds, received ${seconds}`);
  assert.equal(result.reason, "rate_limit");
});

test("a bare 429 gets a 65-second cooldown", () => {
  const now = new Date("2026-10-21T10:00:00.000Z");
  const result = quotaDecision("gemini", new Headers(), {}, now);
  assert.equal(result.retryAt.getTime() - now.getTime(), 65_000);
});

test("Gemini PerDay errors wait until the next Pacific midnight", () => {
  const now = new Date("2026-10-21T10:00:00.000Z");
  const result = quotaDecision("gemini", new Headers(), { error: { message: "PerDay quota exceeded" } }, now);
  assert.equal(result.retryAt.getTime(), nextMidnight("America/Los_Angeles", now).getTime());
  assert.equal(result.reason, "per_day");
});

test("OpenAI insufficient_quota is a six-hour cooldown, not a generic billing match", () => {
  const now = new Date("2026-10-21T10:00:00.000Z");
  const result = quotaDecision("openai", new Headers(), { error: { code: "insufficient_quota", message: "billing limit" } }, now);
  assert.equal(result.retryAt.getTime() - now.getTime(), 6 * 60 * 60 * 1000);
  const gemini = quotaDecision("gemini", new Headers(), { error: { message: "billing information required; per minute limit" } }, now);
  assert.equal(gemini.retryAt.getTime() - now.getTime(), 65_000);
});

test("provider key IDs are stable, short, and do not expose keys", () => {
  const keyId = providerKeyId("private-provider-secret");
  assert.equal(keyId.length, 12);
  assert.equal(keyId, providerKeyId("private-provider-secret"));
  assert.notEqual(keyId, "private-provider-secret");
});
