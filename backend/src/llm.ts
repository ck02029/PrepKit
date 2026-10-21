import { createHash } from "node:crypto";
import { config } from "./config.js";
import { pool } from "./db.js";
import { TransientGenerationError } from "./retry.js";
import { buildGenerationPrompt } from "./llm-prompt.js";
import { buildOutputRepairTask, includePreviousResponse, summarizeOutputValidation } from "./llm-output.js";
import { ZodError } from "zod";

type Provider = "gemini" | "openai";

export class ProviderQuotaWait extends Error {
  constructor(readonly retryAt: Date, readonly providers: Provider[]) {
    super("All configured AI providers are temporarily rate limited.");
    this.name = "ProviderQuotaWait";
  }
}

class ProviderRequestError extends Error {
  constructor(message: string, readonly retryAt?: Date) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateJson<T>(task: string, input: unknown, validate: (value: unknown) => T): Promise<T> {
  const providers: { name: Provider; key: string; model: string }[] = [];
  if (config.GEMINI_API_KEY) providers.push({ name: "gemini", key: config.GEMINI_API_KEY, model: config.LLM_MODEL });
  if (config.OPENAI_API_KEY) providers.push({ name: "openai", key: config.OPENAI_API_KEY, model: config.OPENAI_MODEL });
  if (!providers.length) throw new Error("AI generation is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY to backend/.env.");

  const cacheKey = createHash("sha256").update(JSON.stringify({ task, input, models: providers.map((p) => `${p.name}:${p.model}`), promptVersion: 4 })).digest("hex");
  const cached = await pool.query("SELECT result FROM ai_generation_cache WHERE cache_key=$1 AND expires_at>now()", [cacheKey]);
  if (cached.rowCount) {
    try { return validate(cached.rows[0].result); } catch { await pool.query("DELETE FROM ai_generation_cache WHERE cache_key=$1", [cacheKey]); }
  }

  const quotaWaits: { name: Provider; retryAt: Date }[] = [];
  const failures: string[] = [];
  const transientErrors: TransientGenerationError[] = [];

  for (const provider of providers) {
    let repairHint = "";
    let previousResponse: unknown;
    for (let repair = 0; repair < 2; repair++) {
      let responseText = "";
      let parsed: unknown;
      try {
        const attemptTask = repairHint ? buildOutputRepairTask(task, repairHint) : task;
        const attemptInput = repairHint ? includePreviousResponse(input, previousResponse) : input;
        const prompt = buildGenerationPrompt(attemptTask, attemptInput);
        responseText = await withProviderSlot(provider.name, async () => {
          if (provider.name === "gemini") return callGemini(provider, prompt);
          return callOpenAI(provider, prompt);
        });
        parsed = JSON.parse(responseText);
        const result = validate(parsed);
        await pool.query("INSERT INTO ai_generation_cache(cache_key,result,expires_at) VALUES($1,$2,now()+interval '30 days') ON CONFLICT(cache_key) DO UPDATE SET result=EXCLUDED.result,expires_at=EXCLUDED.expires_at", [cacheKey, JSON.stringify(result)]);
        return result;
      } catch (error) {
        if (error instanceof ProviderRequestError && error.retryAt) {
          quotaWaits.push({ name: provider.name, retryAt: error.retryAt });
          failures.push(`${provider.name}: quota limited`);
          break;
        }
        if (error instanceof TransientGenerationError) {
          transientErrors.push(error);
          failures.push(`${provider.name}: temporary provider error`);
          break;
        }
        if (repair === 0 && (error instanceof SyntaxError || isValidationError(error))) {
          repairHint = error instanceof SyntaxError
            ? "The previous response was invalid JSON. Return a complete valid JSON value."
            : summarizeOutputValidation(error);
          previousResponse = error instanceof SyntaxError ? responseText.slice(0, 12000) : parsed;
          continue;
        }
        if (isValidationError(error)) failures.push(`${provider.name}: output fields did not match the required format (${summarizeOutputValidation(error)})`);
        else if (error instanceof SyntaxError) failures.push(`${provider.name}: returned invalid JSON after a correction attempt`);
        else failures.push(`${provider.name}: ${error instanceof Error ? error.message : "request failed"}`);
        break;
      }
    }
  }

  if (quotaWaits.length) {
    // Wait until the longest provider cooldown so a job does not repeatedly hit the other provider.
    throw new ProviderQuotaWait(new Date(Math.max(...quotaWaits.map((wait) => wait.retryAt.getTime()))), quotaWaits.map((wait) => wait.name));
  }
  if (transientErrors.length) throw new TransientGenerationError(`AI providers are temporarily unavailable (${failures.join("; ")}).`, Math.max(...transientErrors.map((error) => error.retryAfterMs ?? 0)) || undefined);
  throw new Error(failures.length ? `AI providers could not complete this stage (${failures.join("; ")}).` : "AI providers could not complete this stage.");
}

async function withProviderSlot<T>(provider: Provider, action: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const lockId = provider === "gemini" ? 71820411 : 71820412;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [lockId]);
    const previous = await client.query("SELECT last_started_at FROM ai_provider_limits WHERE provider=$1", [provider]);
    if (previous.rowCount) {
      const elapsed = Date.now() - new Date(previous.rows[0].last_started_at).getTime();
      if (elapsed < config.LLM_MIN_REQUEST_INTERVAL_MS) await pause(config.LLM_MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    await client.query("INSERT INTO ai_provider_limits(provider,last_started_at) VALUES($1,now()) ON CONFLICT(provider) DO UPDATE SET last_started_at=now()", [provider]);
    return await action();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [lockId]).catch(() => undefined);
    client.release();
  }
}

async function callGemini(provider: { key: string; model: string }, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`;
  let response:Response;
  try { response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": provider.key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.25 } }), signal: AbortSignal.timeout(45000) }); }
  catch { throw new TransientGenerationError("Gemini request failed temporarily."); }
  const body = await response.json().catch(() => ({})) as any;
  if (response.status === 429) throw new ProviderRequestError("Gemini quota reached", providerRetryAt("gemini", response.headers, body));
  if (response.status === 408 || response.status === 425 || response.status >= 500) throw new TransientGenerationError(`Gemini returned temporary HTTP ${response.status}.`, 2_000);
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}: ${body.error?.message ?? "provider request failed"}`);
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((part: any) => typeof part.text === "string" ? part.text : "").join("") ?? "";
  if (!text) {
    const reason = candidate?.finishReason;
    throw new Error(reason
      ? `Gemini returned no text (finish reason: ${reason}${candidate?.safetyRatings ? `; safety ratings: ${JSON.stringify(candidate.safetyRatings)}` : ""}).`
      : "Gemini returned an empty response with no candidate text.");
  }
  return text;
}

function isValidationError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

async function callOpenAI(provider: { key: string; model: string }, prompt: string): Promise<string> {
  let response:Response;
  try { response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${provider.key}` }, body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.25 }), signal: AbortSignal.timeout(45000) }); }
  catch { throw new TransientGenerationError("OpenAI request failed temporarily."); }
  const body = await response.json().catch(() => ({})) as any;
  if (response.status === 429) throw new ProviderRequestError("OpenAI quota reached", providerRetryAt("openai", response.headers, body));
  if (response.status === 408 || response.status === 425 || response.status >= 500) throw new TransientGenerationError(`OpenAI returned temporary HTTP ${response.status}.`, 2_000);
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}: ${body.error?.message ?? "provider request failed"}`);
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new Error("OpenAI returned an empty response.");
  return text;
}

function providerRetryAt(provider: Provider, headers: Headers, body: unknown): Date {
  const now = Date.now();
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const timestamp = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retryAfter);
    if (Number.isFinite(timestamp) && timestamp > now) return new Date(timestamp);
  }
  const retryAfterMs = Number(headers.get("retry-after-ms"));
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return new Date(now + retryAfterMs);
  const reset = parseProviderDelay(headers.get("x-ratelimit-reset-requests")) ?? findRetryDelay(body);
  if (reset !== null && reset > 0) return new Date(now + reset);
  const bodyText = JSON.stringify(body);
  const daily = /per.?day|requests_per_day|daily quota|quota_exceeded|insufficient_quota|current quota/i.test(bodyText);
  if (daily && provider === "gemini") return nextPacificMidnight();
  // Some providers omit Retry-After on 429. Use a conservative cooldown and retry later.
  return new Date(Date.now() + (daily ? 6 * 60 * 60 * 1000 : 60 * 1000));
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
  const object = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(object)) {
    if (key.toLowerCase() === "retrydelay" && typeof item === "string") return parseProviderDelay(item);
    const nested = findRetryDelay(item);
    if (nested !== null) return nested;
  }
  return null;
}

function nextPacificMidnight(): Date {
  const now = Date.now();
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  for (let minute = 1; minute <= 1800; minute++) {
    const candidate = new Date(now + minute * 60_000);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(candidate);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    if (date !== currentDate && values.hour === "00" && values.minute === "00") return candidate;
  }
  return new Date(now + 24 * 60 * 60 * 1000);
}
