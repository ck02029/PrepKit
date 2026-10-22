import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Resolve the backend env file relative to this module so workspace commands
// work the same whether they are launched from the repo root or backend/.
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const isProduction = process.env.NODE_ENV === "production";

const configSchema = z.object({
  PORT: z.coerce.number().default(8000), DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"), SESSION_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().optional(), GEMINI_API_KEYS: z.string().optional(), LLM_MODEL: z.string().default("gemini-3.5-flash-lite"),
  OPENAI_API_KEY: z.string().optional(), OPENAI_API_KEYS: z.string().optional(), OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  GROQ_API_KEY: z.string().optional(), GROQ_API_KEYS: z.string().optional(), GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  AI_FREE_ONLY: z.enum(["true", "false"]).default("false"),
  LLM_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).max(60000).default(5000),
  LLM_DAILY_CALLS_PER_KEY: z.coerce.number().int().min(0).default(150),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).default(8192),
  MAX_QUESTIONS_PER_CATEGORY: z.coerce.number().int().min(1).max(20).default(6),
  MAX_KITS_PER_DAY: z.coerce.number().int().min(1).default(10),
  REGENERATIONS_PER_HOUR: z.coerce.number().int().min(1).default(6),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  MAX_DAYS: z.coerce.number().int().min(1).max(60).default(60), MAX_JD_CHARS: z.coerce.number().int().default(30000),
  FETCH_TIMEOUT_MS: z.coerce.number().default(6000), FETCH_MAX_BYTES: z.coerce.number().default(1500000), CRAWL_MAX_PAGES: z.coerce.number().default(4),
  COOKIE_SECURE: z.enum(["true", "false"]).default(isProduction ? "true" : "false"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
});

export const config = configSchema.parse(process.env);
const parseKeys = (single?: string, multiple?: string) => [...new Set([...(single ? [single] : []), ...(multiple ?? "").split(",")].map((key) => key.trim()).filter(Boolean))];
export const geminiApiKeys = parseKeys(config.GEMINI_API_KEY, config.GEMINI_API_KEYS);
export const openaiApiKeys = parseKeys(config.OPENAI_API_KEY, config.OPENAI_API_KEYS);
export const groqApiKeys = parseKeys(config.GROQ_API_KEY, config.GROQ_API_KEYS);
export const freeOnly = config.AI_FREE_ONLY === "true";

if (isProduction) {
  const origins = config.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.some((origin) => new URL(origin).protocol !== "https:")) {
    throw new Error("Production FRONTEND_ORIGIN entries must use HTTPS.");
  }
  if (config.COOKIE_SECURE !== "true") throw new Error("COOKIE_SECURE=true is required in production.");
  if (!geminiApiKeys.length && !openaiApiKeys.length && !groqApiKeys.length) throw new Error("Configure GEMINI_API_KEY(S), OPENAI_API_KEY(S), or GROQ_API_KEY(S) in production.");
}
