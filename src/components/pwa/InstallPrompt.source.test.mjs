import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./InstallPrompt.tsx", import.meta.url), "utf8");

test("install prompt is hidden on public customer terms page", () => {
  assert.match(source, /usePathname/);
  assert.match(source, /INSTALL_PROMPT_BLOCKED_PATHS/);
  assert.match(source, /"\/terms-and-conditions"/);
  assert.match(source, /INSTALL_PROMPT_BLOCKED_PATHS\.some/);
  assert.match(source, /if \(isBlockedPath\) return null/);
});
