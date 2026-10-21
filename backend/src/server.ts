import { app } from "./app.js";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";

await migrate();
const server = app.listen(config.PORT, () => console.log(`PrepKit API listening on ${config.PORT}`));

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { void pool.end().then(() => process.exit(0)); });
    const timeout = setTimeout(() => { void pool.end().finally(() => process.exit(1)); }, 25000);
    timeout.unref();
  });
}
