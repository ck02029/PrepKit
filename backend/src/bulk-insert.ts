import type { PoolClient } from "pg";

type Pair = readonly [string, string];

export async function insertPairs(client: PoolClient, table: string, leftColumn: string, rightColumn: string, pairs: Pair[]) {
  if (!pairs.length) return;
  await client.query(
    `INSERT INTO ${table}(${leftColumn},${rightColumn}) SELECT * FROM UNNEST($1::text[],$2::text[]) ON CONFLICT DO NOTHING`,
    [pairs.map(([left]) => left), pairs.map(([, right]) => right)],
  );
}
