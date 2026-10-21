import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { PoolClient } from "pg";
import { ZodError } from "zod";
import { pool } from "./db.js";

export const id = () => randomUUID();
export class HttpError extends Error { constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); } }
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const result = await fn(c); await c.query("COMMIT"); return result; }
  catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
export function errors(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const requestId = id();
  if (err instanceof HttpError) { res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}), requestId } }); return; }
  if (err instanceof ZodError) { res.status(400).json({ error: { code: "INVALID_INPUT", message: "Request data did not match the expected format.", details: err.issues, requestId } }); return; }
  console.error(JSON.stringify({ requestId, error: err instanceof Error ? err.message : "unknown" }));
  res.status(500).json({ error: { code: "INTERNAL", message: "The request could not be completed.", requestId } });
}
