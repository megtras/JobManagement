import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sidebarSource = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("./TopBar.tsx", import.meta.url), "utf8");

test("technician identity display uses the account name without appended team groups", () => {
  assert.match(sidebarSource, /const displayName = session\?\.user\?\.name \?\? ".*"/);
  assert.match(sidebarSource, /const displayRole = role === "TECHNICIAN" \? "Team" : role \? roleBadge\(role\) : ""/);
  assert.doesNotMatch(sidebarSource, /session!?\.user\.teamName/);
  assert.doesNotMatch(topBarSource, /session\.user\.teamName/);
  assert.match(topBarSource, /\(session\?\.user\?\.name\)\?\.\[0\]\?\.toUpperCase\(\) \?\? "\?"/);
});
