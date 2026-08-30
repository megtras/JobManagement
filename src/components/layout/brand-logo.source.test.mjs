import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebarSource = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("./TopBar.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../../app/(application)/login/page.tsx", import.meta.url), "utf8");

test("application shell uses the GenPlus logo asset instead of the old wind icon", () => {
  for (const source of [sidebarSource, topBarSource, loginSource]) {
    assert.match(source, /GenPlusLogo/);
    assert.doesNotMatch(source, /<Wind/);
  }
});

test("desktop sidebar uses a dark black background with a blurred GenPlus teal glow", () => {
  assert.match(sidebarSource, /radial-gradient\(circle at -16% 58%, #1ea89bcc 0%, #1ea89b8f 30%, #1ea89b40 55%, transparent 78%\)/);
  assert.match(sidebarSource, /radial-gradient\(circle at 52% 88%, #1ea89b80 0%, #1ea89b36 44%, transparent 68%\)/);
  assert.match(sidebarSource, /linear-gradient\(180deg, #092326 0%, #031011 100%\)/);
  assert.match(sidebarSource, /pointer-events-none absolute inset-0/);
  assert.match(sidebarSource, /linear-gradient\(180deg, rgba\(0, 0, 0, 0\.08\) 0%, rgba\(0, 0, 0, 0\.18\) 52%, rgba\(0, 0, 0, 0\.52\) 100%\)/);
  assert.match(sidebarSource, /className="relative z-10/);
  assert.match(sidebarSource, /#1ea89b/);
  assert.doesNotMatch(sidebarSource, /bg-neutral-950/);
  assert.doesNotMatch(sidebarSource, /bg-\[#061517\]/);
});
