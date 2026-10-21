import { createHash } from "node:crypto";

/** Model output must never supply persisted IDs. IDs are created from trusted
 * application scope and the generated item's content instead. */
export function stableId(scope: string, kind: string, value: string): string {
  return createHash("sha256").update(`${scope}:${kind}:${value.toLowerCase().trim()}`).digest("hex").slice(0, 32);
}
