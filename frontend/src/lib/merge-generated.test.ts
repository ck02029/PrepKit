import assert from "node:assert/strict";
import test from "node:test";
import { mergeGeneratedItems, type OriginItem } from "./merge-generated.ts";

type Item = OriginItem & { id: string };

test("replaces generated items while preserving user-owned items and their order", () => {
  const current: Item[] = [
    { id: "generated-old", origin: "generated" },
    { id: "edited", origin: "edited" },
    { id: "pinned", origin: "pinned" },
    { id: "user", origin: "user" },
  ];
  const incoming: Item[] = [{ id: "generated-new", origin: "generated" }];

  assert.deepEqual(mergeGeneratedItems(current, incoming).map((item) => item.id), [
    "generated-new",
    "edited",
    "pinned",
    "user",
  ]);
});
