import assert from "node:assert/strict";
import test from "node:test";
import { keepRequirementsWithExactQuotes } from "./evidence.js";

test("unsupported model evidence quotes are rejected", () => {
  const rows = [
    { text: "TypeScript", quote: "Build TypeScript services" },
    { text: "Unfounded", quote: "Expert in quantum computing" },
    { text: "Blank", quote: "   " },
  ];
  assert.deepEqual(keepRequirementsWithExactQuotes(rows, "Build TypeScript services and APIs."), [rows[0]]);
});
