import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");

test("technician session refreshes team name from current team membership", () => {
  assert.match(source, /async session\(\{ session, token \}\)/);
  assert.match(source, /if \(token\.role === "TECHNICIAN"\)/);
  assert.match(source, /where: \{ members: \{ some: \{ id: token\.id \} \} \}/);
  assert.match(source, /teamName = teams\.map\(\(t\) => t\.name\)\.join\(", "\) \|\| null/);
  assert.match(source, /session\.user\.teamName = teamName/);
});
