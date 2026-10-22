import { createHash } from "node:crypto";

export type ProviderName = "gemini" | "groq" | "openai";
export type QuotaDecision = { retryAt: Date; reason: "per_day" | "insufficient_quota" | "rate_limit" };

export function providerKeyId(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

export function quotaDecision(provider: ProviderName, headers: Headers, body: unknown, now = new Date()): QuotaDecision {
  const error = body && typeof body === "object" ? (body as any).error : undefined;
  const text = JSON.stringify(body ?? "");
  if (provider === "gemini" && /PerDay/i.test(text)) {
    return { retryAt: nextMidnight("America/Los_Angeles", now), reason: "per_day" };
  }
  if (provider === "openai" && [error?.code, error?.type].includes("insufficient_quota")) {
    return { retryAt: new Date(now.getTime() + 6 * 60 * 60 * 1000), reason: "insufficient_quota" };
  }
  const retryDelayMs = responseRetryDelay(headers, body);
  return { retryAt: new Date(now.getTime() + (retryDelayMs ?? 65_000)), reason: "rate_limit" };
}

export function responseRetryDelay(headers: Headers, body: unknown): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) return Math.max(0, timestamp - Date.now());
  }
  const retryAfterMs = Number(headers.get("retry-after-ms"));
  if (headers.has("retry-after-ms") && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return retryAfterMs;
  for (const header of ["x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"]) {
    const parsed = parseProviderDelay(headers.get(header));
    if (parsed !== null) return parsed;
  }
  return findRetryDelay(body);
}

export function nextMidnight(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const nextDay = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1));
  const target = { year: nextDay.getUTCFullYear(), month: nextDay.getUTCMonth() + 1, day: nextDay.getUTCDate(), hour: 0, minute: 0, second: 0 };
  let candidate = Date.UTC(target.year, target.month - 1, target.day);
  for (let attempt = 0; attempt < 4; attempt++) {
    const localParts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    const local = Object.fromEntries(localParts.map((part) => [part.type, Number(part.value)]));
    const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const wantedAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
    candidate += wantedAsUtc - representedAsUtc;
  }
  return new Date(candidate);
}

function parseProviderDelay(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const match = value.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (!match) return null;
  const ms = (Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)) * 1000;
  return ms > 0 ? ms : null;
}

function findRetryDelay(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) { const delay = findRetryDelay(item); if (delay !== null) return delay; }
    return null;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === "retrydelay" && typeof item === "string") return parseProviderDelay(item);
    const nested = findRetryDelay(item);
    if (nested !== null) return nested;
  }
  return null;
}
