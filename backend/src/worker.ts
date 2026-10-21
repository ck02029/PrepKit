import { pool, migrate } from "./db.js";
import { runWorkerLoop } from "./worker-runtime.js";

await migrate();

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => { stopping = true; });
}

try {
  await runWorkerLoop(() => stopping);
} finally {
  await pool.end();
}
