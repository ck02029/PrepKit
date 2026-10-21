import { pool } from "./db.js";

/** Atomically claim the next ready or expired generation job across workers. */
export async function claimNextJob() {
  const result = await pool.query(`UPDATE generation_jobs
    SET status='running', error=NULL, attempts=attempts+1, heartbeat_at=now(), lease_until=now()+interval '90 seconds', updated_at=now()
    WHERE id=(
      SELECT id FROM generation_jobs
      WHERE (status='queued' AND available_at<=now()) OR (status='running' AND lease_until<now() AND attempts<5)
      ORDER BY available_at,created_at
      FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING *`);
  return result.rows[0] ?? null;
}
