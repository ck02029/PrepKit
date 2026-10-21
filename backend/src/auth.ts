import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.js";
import { HttpError, id } from "./shared.js";
import { config } from "./config.js";

declare global { namespace Express { interface Request { userId?: string } } }
export const digestSessionToken = (token: string) => createHmac("sha256", config.SESSION_SECRET).update(token).digest("hex");
export async function register(email: string, password: string) {
  const userId = id(); const hash = await bcrypt.hash(password, 12);
  try { await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [userId, email.toLowerCase(), hash]); }
  catch { throw new HttpError(409, "ACCOUNT_EXISTS", "An account with that email already exists."); }
  return userId;
}
export async function login(email: string, password: string, res: Response) {
  const q = await pool.query("SELECT id,password_hash FROM users WHERE email=$1", [email.toLowerCase()]);
  if (!q.rowCount || !(await bcrypt.compare(password, q.rows[0].password_hash))) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  const token = randomBytes(32).toString("base64url"); const sessionId = digestSessionToken(token);
  await pool.query("DELETE FROM sessions WHERE user_id=$1",[q.rows[0].id]);
  await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '14 days')", [sessionId, q.rows[0].id]);
  res.cookie("prepkit_session", token, { httpOnly: true, secure: config.COOKIE_SECURE === "true", sameSite: config.COOKIE_SAME_SITE, path: "/", maxAge: 14 * 86400000 });
  return q.rows[0].id as string;
}
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.prepkit_session;
    if (!token) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
    const result = await pool.query("UPDATE sessions SET expires_at=now()+interval '14 days' WHERE id=$1 AND expires_at>now() RETURNING user_id", [digestSessionToken(token)]);
    if (!result.rowCount) throw new HttpError(401, "SESSION_EXPIRED", "Your session expired. Please sign in again.");
    req.userId = result.rows[0].user_id; next();
  } catch (e) { next(e); }
}
