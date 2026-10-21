import { pool, migrate } from "./db.js";
import { runPipeline } from "./pipeline.js";
import { claimNextJob } from "./job-runner.js";

async function workOnce() {
  const stale=await pool.query("UPDATE generation_jobs SET status='failed',stage='failed',error=$1::jsonb,lease_until=NULL WHERE status='running' AND lease_until<now() AND attempts>=5 RETURNING kit_id",[JSON.stringify({code:"LEASE_EXPIRED",message:"Worker lease expired too many times."})]);for(const item of stale.rows)await pool.query("UPDATE kits SET status='failed' WHERE id=$1",[item.kit_id]);
  const job = await claimNextJob(); if (!job) return false;
  const heartbeat=setInterval(()=>{void pool.query("UPDATE generation_jobs SET heartbeat_at=now(),lease_until=now()+interval '90 seconds' WHERE id=$1 AND status='running'",[job.id]).catch((error)=>console.error(JSON.stringify({event:"worker_heartbeat_error",jobId:job.id,message:error instanceof Error?error.message:"unknown"})));},30000);
  try { await runPipeline({ ...job.input_snapshot, kitId:job.kit_id, jobId:job.id }); }
  catch (e) { console.error(JSON.stringify({jobId:job.id,stage:job.stage,error:e instanceof Error?e.message:"unknown"})); }
  finally { clearInterval(heartbeat); }
  return true;
}
await migrate();
console.log("PrepKit worker started");

let stopping = false;
let idleBackoffMs = 500;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { stopping = true; });
while (!stopping) {
  try {
    if (await workOnce()) idleBackoffMs = 500;
    else {
      await new Promise((resolve) => setTimeout(resolve, idleBackoffMs));
      idleBackoffMs = Math.min(10000, idleBackoffMs * 2);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "worker_loop_error", message: error instanceof Error ? error.message : "unknown" }));
    await new Promise((resolve) => setTimeout(resolve, idleBackoffMs));
    idleBackoffMs = Math.min(10000, idleBackoffMs * 2);
  }
}
await pool.end();
