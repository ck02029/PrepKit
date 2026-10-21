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
  GEMINI_API_KEY: z.string().optional(), LLM_MODEL: z.string().default("gemini-3.5-flash-lite"),
  OPENAI_API_KEY: z.string().optional(), OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  LLM_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).max(60000).default(5000),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  MAX_DAYS: z.coerce.number().int().min(1).max(60).default(60), MAX_JD_CHARS: z.coerce.number().int().default(30000),
  FETCH_TIMEOUT_MS: z.coerce.number().default(8000), FETCH_MAX_BYTES: z.coerce.number().default(1500000), CRAWL_MAX_PAGES: z.coerce.number().default(12),
  COOKIE_SECURE: z.enum(["true", "false"]).default(isProduction ? "true" : "false"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
});

export const config = configSchema.parse(process.env);

if (isProduction) {
  const origins = config.FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.some((origin) => new URL(origin).protocol !== "https:")) {
    throw new Error("Production FRONTEND_ORIGIN entries must use HTTPS.");
  }
  if (config.COOKIE_SECURE !== "true") throw new Error("COOKIE_SECURE=true is required in production.");
  if (!config.GEMINI_API_KEY && !config.OPENAI_API_KEY) throw new Error("Configure GEMINI_API_KEY or OPENAI_API_KEY in production.");
}
