import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./waze.ts", import.meta.url), "utf8");

test("shared Waze helper builds navigation links from coordinates and address text", () => {
  assert.match(source, /export function buildWazeLink/);
  assert.match(source, /new URLSearchParams/);
  assert.match(source, /params\.set\("navigate", "yes"\)/);
  assert.match(source, /params\.set\("ll", `\$\{lat\},\$\{lng\}`\)/);
  assert.match(source, /const cleanedAddress = cleanValue\(address\)/);
  assert.match(source, /params\.set\("q", cleanedAddress\)/);
  assert.match(source, /return `https:\/\/waze\.com\/ul\?\$\{params\.toString\(\)\}`/);
});
