import { createHash } from "node:crypto";
import { config, geminiApiKeys, openaiApiKeys } from "./config.js";
import { pool } from "./db.js";
import { TransientGenerationError } from "./retry.js";
import { buildGenerationPrompt } from "./llm-prompt.js";
import { buildOutputRepairTask, includePreviousResponse, summarizeOutputValidation } from "./llm-output.js";
import { ZodError } from "zod";
import { nextMidnight, providerKeyId, quotaDecision, type ProviderName } from "./provider-quota.js";

type ProviderSpec = { name: ProviderName; key: string; keyId: string; model: string };
export class ProviderQuotaWait extends Error {
  constructor(readonly retryAt: Date, readonly providers: ProviderName[]) {
    super("All configured AI provider keys are temporarily rate limited.");
    this.name = "ProviderQuotaWait";
  }
}
class ProviderRequestError extends Error {
  constructor(message: string, readonly retryAt: Date, readonly reason: string) { super(message); this.name = "ProviderRequestError"; }
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function configuredProviders(): ProviderSpec[] {
  return [
    ...geminiApiKeys.map((key) => ({ name: "gemini" as const, key, keyId: providerKeyId(key), model: config.LLM_MODEL })),
    ...openaiApiKeys.map((key) => ({ name: "openai" as const, key, keyId: providerKeyId(key), model: config.OPENAI_MODEL })),
  ];
}

function keyDay(provider: ProviderName, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: provider === "gemini" ? "America/Los_Angeles" : "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function blockKey(spec: ProviderSpec, retryAt: Date, reason: string) {
  await pool.query(`INSERT INTO ai_key_state(key_id,provider,blocked_until,reason,updated_at)
    VALUES($1,$2,$3,$4,now()) ON CONFLICT(key_id) DO UPDATE SET
    provider=EXCLUDED.provider,blocked_until=GREATEST(COALESCE(ai_key_state.blocked_until,EXCLUDED.blocked_until),EXCLUDED.blocked_until),reason=EXCLUDED.reason,updated_at=now()`,
  [spec.keyId, spec.name, retryAt, reason]);
}

type Reservation = { waitMs: number } | { blockedUntil: Date; reason: string };
async function reserveKey(spec: ProviderSpec): Promise<Reservation> {
  const now = new Date();
  const day = keyDay(spec.name, now);
  const state = await pool.query("SELECT blocked_until,reason FROM ai_key_state WHERE key_id=$1", [spec.keyId]);
  if (state.rows[0]?.blocked_until && new Date(state.rows[0].blocked_until) > now) return { blockedUntil: new Date(state.rows[0].blocked_until), reason: state.rows[0].reason };

  const usage = await pool.query(`INSERT INTO ai_key_usage(key_id,day,calls) VALUES($1,$2,1)
    ON CONFLICT(key_id,day) DO UPDATE SET calls=ai_key_usage.calls+1 RETURNING calls`, [spec.keyId, day]);
  const calls = Number(usage.rows[0].calls);
  if (config.LLM_DAILY_CALLS_PER_KEY === 0 || calls > config.LLM_DAILY_CALLS_PER_KEY) {
    const retryAt = nextMidnight(spec.name === "gemini" ? "America/Los_Angeles" : "UTC", now);
    await blockKey(spec, retryAt, "daily_budget");
    return { blockedUntil: retryAt, reason: "daily_budget" };
  }

  // Reserve the next provider slot atomically, then release the pool connection
  // before sleeping or making the outbound HTTP request.
  const slot = await pool.query(`INSERT INTO ai_provider_limits(provider,last_started_at) VALUES($1,now())
    ON CONFLICT(provider) DO UPDATE SET last_started_at=GREATEST(now(),ai_provider_limits.last_started_at + ($2::int * interval '1 millisecond'))
    RETURNING GREATEST(0,(EXTRACT(EPOCH FROM (last_started_at-now()))*1000)::int) AS wait_ms`,
  [`${spec.name}:${spec.keyId}`, config.LLM_MIN_REQUEST_INTERVAL_MS]);
  return { waitMs: Number(slot.rows[0].wait_ms) };
}

async function listKeysLeastUsed(specs: ProviderSpec[]) {
  if (!specs.length) return [];
  const day = keyDay(specs[0].name);
  const ids = specs.map((item) => item.keyId);
  const result = await pool.query(`SELECT candidate.key_id,COALESCE(usage.calls,0)::int AS calls
    FROM unnest($1::text[]) AS candidate(key_id)
    LEFT JOIN ai_key_usage usage ON usage.key_id=candidate.key_id AND usage.day=$2
    ORDER BY calls,candidate.key_id`, [ids, day]);
  const rank = new Map(result.rows.map((row: any, index: number) => [row.key_id, index]));
  return [...specs].sort((a, b) => (rank.get(a.keyId) ?? 0) - (rank.get(b.keyId) ?? 0));
}

async function callWithKey<T>(spec: ProviderSpec, action: (spec: ProviderSpec) => Promise<T>): Promise<T> {
  const reservation = await reserveKey(spec);
  if ("blockedUntil" in reservation) throw new ProviderRequestError("Provider key is cooling down.", reservation.blockedUntil, reservation.reason);
  if (reservation.waitMs > 0) await pause(reservation.waitMs);
  return action(spec);
}

async function everyConfiguredKeyBlocked(specs: ProviderSpec[]) {
  if (!specs.length) return null;
  const result = await pool.query("SELECT key_id,blocked_until,reason FROM ai_key_state WHERE key_id=ANY($1::text[])", [specs.map((item) => item.keyId)]);
  const byId = new Map(result.rows.map((row: any) => [row.key_id, row]));
  const now = Date.now();
  const blocked = specs.map((spec) => ({ spec, state: byId.get(spec.keyId) })).filter(({ state }) => state?.blocked_until && new Date(state.blocked_until).getTime() > now);
  if (blocked.length !== specs.length) return null;
  return { retryAt: new Date(Math.min(...blocked.map(({ state }: any) => new Date(state.blocked_until).getTime()))), providers: [...new Set(blocked.map(({ spec }) => spec.name))] as ProviderName[] };
}

export async function generateJson<T>(task: string, input: unknown, validate: (value: unknown) => T): Promise<T> {
  const providers = configuredProviders();
  if (!providers.length) throw new Error("AI generation is not configured. Add GEMINI_API_KEY(S) or OPENAI_API_KEY(S) in the backend environment.");
  const models = [...new Set(providers.map((p) => `${p.name}:${p.model}`))];
  const cacheKey = createHash("sha256").update(JSON.stringify({ task, input, models, promptVersion: 5 })).digest("hex");
  const cached = await pool.query("SELECT result FROM ai_generation_cache WHERE cache_key=$1 AND expires_at>now()", [cacheKey]);
  if (cached.rowCount) {
    try { return validate(cached.rows[0].result); } catch { await pool.query("DELETE FROM ai_generation_cache WHERE cache_key=$1", [cacheKey]); }
  }

  const failures: string[] = [];
  const transientErrors: TransientGenerationError[] = [];
  for (const providerName of ["gemini", "openai"] as const) {
    const group = await listKeysLeastUsed(providers.filter((item) => item.name === providerName));
    for (const spec of group) {
      let repairHint = "";
      let previousResponse: unknown;
      for (let repair = 0; repair < 2; repair++) {
        let responseText = "";
        let parsed: unknown;
        try {
          const attemptTask = repairHint ? buildOutputRepairTask(task, repairHint) : task;
          const attemptInput = repairHint ? includePreviousResponse(input, previousResponse) : input;
          const prompt = buildGenerationPrompt(attemptTask, attemptInput);
          responseText = await callWithKey(spec, (key) => providerName === "gemini" ? callGemini(key, prompt) : callOpenAI(key, prompt));
          parsed = JSON.parse(responseText);
          const result = validate(parsed);
          await pool.query("INSERT INTO ai_generation_cache(cache_key,result,expires_at) VALUES($1,$2,now()+interval '30 days') ON CONFLICT(cache_key) DO UPDATE SET result=EXCLUDED.result,expires_at=EXCLUDED.expires_at", [cacheKey, JSON.stringify(result)]);
          return result;
        } catch (error) {
          if (error instanceof ProviderRequestError) {
            await blockKey(spec, error.retryAt, error.reason);
            failures.push(`${spec.name}:${spec.keyId}: rate limited`);
            break;
          }
          if (error instanceof TransientGenerationError) { transientErrors.push(error); failures.push(`${spec.name}:${spec.keyId}: temporarily unavailable`); break; }
          if (repair === 0 && (error instanceof SyntaxError || isValidationError(error))) {
            repairHint = error instanceof SyntaxError ? "The previous response was invalid JSON. Return a complete valid JSON value." : summarizeOutputValidation(error);
            previousResponse = error instanceof SyntaxError ? responseText.slice(0, 12000) : parsed;
            continue;
          }
          failures.push(`${spec.name}:${spec.keyId}: ${error instanceof Error ? error.message : "request failed"}`);
          break;
        }
      }
    }
  }
  const allBlocked = await everyConfiguredKeyBlocked(providers);
  if (allBlocked) throw new ProviderQuotaWait(allBlocked.retryAt, allBlocked.providers);
  if (transientErrors.length) throw new TransientGenerationError(`AI providers are temporarily unavailable (${failures.join("; ")}).`, Math.max(...transientErrors.map((error) => error.retryAfterMs ?? 0)) || undefined);
  throw new Error(failures.length ? `AI providers could not complete this stage (${failures.join("; ")}).` : "AI providers could not complete this stage.");
}

export async function requestGeminiGrounded(prompt: string, explicitKey?: string): Promise<any | null> {
  if (explicitKey !== undefined) return requestGeminiWithKey({ name: "gemini", key: explicitKey, keyId: providerKeyId(explicitKey), model: config.LLM_MODEL }, prompt);
  const specs = await listKeysLeastUsed(configuredProviders().filter((item) => item.name === "gemini"));
  const failures: string[] = [];
  for (const spec of specs) {
    try { return await callWithKey(spec, (key) => requestGeminiWithKey(key, prompt)); }
    catch (error) {
      if (error instanceof ProviderRequestError) { await blockKey(spec, error.retryAt, error.reason); failures.push(`${spec.keyId}: rate limited`); continue; }
      if (error instanceof TransientGenerationError) { failures.push(`${spec.keyId}: temporarily unavailable`); continue; }
      throw error;
    }
  }
  if (!specs.length || failures.length) return null;
  return null;
}

async function requestGeminiWithKey(spec: ProviderSpec, prompt: string): Promise<any | null> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(spec.model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": spec.key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS } }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => { throw new TransientGenerationError("Gemini research request failed temporarily."); });
  const body = await response.json().catch(() => ({})) as any;
  if (response.status === 429) {
    const decision = quotaDecision("gemini", response.headers, body);
    throw new ProviderRequestError("Gemini research quota reached", decision.retryAt, decision.reason);
  }
  if (response.status === 408 || response.status === 425 || response.status >= 500) throw new TransientGenerationError(`Gemini returned temporary HTTP ${response.status}.`, 2_000);
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}: ${body.error?.message ?? "provider request failed"}`);
  return body;
}

async function callGemini(provider: ProviderSpec, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`;
  let response: Response;
  try { response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": provider.key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.25, maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS } }), signal: AbortSignal.timeout(45000) }); }
  catch { throw new TransientGenerationError("Gemini request failed temporarily."); }
  const body = await response.json().catch(() => ({})) as any;
  if (response.status === 429) { const decision = quotaDecision("gemini", response.headers, body); throw new ProviderRequestError("Gemini quota reached", decision.retryAt, decision.reason); }
  if (response.status === 408 || response.status === 425 || response.status >= 500) throw new TransientGenerationError(`Gemini returned temporary HTTP ${response.status}.`, 2_000);
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}: ${body.error?.message ?? "provider request failed"}`);
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((part: any) => typeof part.text === "string" ? part.text : "").join("") ?? "";
  if (!text) throw new Error(candidate?.finishReason ? `Gemini returned no text (finish reason: ${candidate.finishReason}).` : "Gemini returned an empty response with no candidate text.");
  return text;
}

function isValidationError(error: unknown): error is ZodError { return error instanceof ZodError; }

async function callOpenAI(provider: ProviderSpec, prompt: string): Promise<string> {
  let response: Response;
  try { response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${provider.key}` }, body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, max_tokens: config.LLM_MAX_OUTPUT_TOKENS, temperature: 0.25 }), signal: AbortSignal.timeout(45000) }); }
  catch { throw new TransientGenerationError("OpenAI request failed temporarily."); }
  const body = await response.json().catch(() => ({})) as any;
  if (response.status === 429) { const decision = quotaDecision("openai", response.headers, body); throw new ProviderRequestError("OpenAI request rate limited", decision.retryAt, decision.reason); }
  if (response.status === 408 || response.status === 425 || response.status >= 500) throw new TransientGenerationError(`OpenAI returned temporary HTTP ${response.status}.`, 2_000);
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}: ${body.error?.message ?? "provider request failed"}`);
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new Error("OpenAI returned an empty response.");
  return text;
}
