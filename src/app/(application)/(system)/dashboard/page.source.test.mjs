import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("technician dashboard page passes job title data into dashboard tasks", () => {
  assert.match(source, /jobTitle: true/);
  assert.match(source, /jobTitle: a\.jobTitle \|\| null/);
});
