import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appLayoutSource = readFileSync(new URL("../../app/(application)/(system)/layout.tsx", import.meta.url), "utf8");
const bottomNavSource = readFileSync(new URL("./BottomNav.tsx", import.meta.url), "utf8");

test("mobile PWA shell keeps bottom navigation outside the scrolling content", () => {
  assert.match(appLayoutSource, /h-\[100dvh\] overflow-hidden bg-gray-50/);
  assert.match(appLayoutSource, /overflow-y-auto/);
  assert.match(appLayoutSource, /pb-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(bottomNavSource, /fixed bottom-0 left-0 right-0/);
  assert.match(bottomNavSource, /pb-\[env\(safe-area-inset-bottom\)\]/);
});
