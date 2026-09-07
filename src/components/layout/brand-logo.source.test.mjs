import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebarSource = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const topBarSource = readFileSync(new URL("./TopBar.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../../app/(application)/login/page.tsx", import.meta.url), "utf8");

test("application shell uses the Megtras logo asset instead of the old wind icon", () => {
  for (const source of [sidebarSource, topBarSource, loginSource]) {
    assert.match(source, /MegtrasLogo/);
    assert.doesNotMatch(source, /<Wind/);
  }
});

test("desktop sidebar is a flat dark rail, not a colour-washed gradient", () => {
  // A near-flat charcoal ground. Tinted radial washes over charcoal read as
  // muddy olive and cost the nav labels their contrast, so there are none.
  assert.match(sidebarSource, /linear-gradient\(180deg, #1A1917 0%, #121110 55%, #0D0C0B 100%\)/);
  assert.doesNotMatch(sidebarSource, /radial-gradient\(circle at/);
  assert.doesNotMatch(sidebarSource, /#F2B705(?:59|38|30|18|14)\b/);
  // Depth is a neutral top sheen plus a bottom fade — no hue.
  assert.match(sidebarSource, /pointer-events-none absolute inset-0/);
  assert.match(sidebarSource, /radial-gradient\(120% 60% at 50% 0%, rgba\(255, 255, 255, 0\.045\) 0%, transparent 60%\)/);
  assert.match(sidebarSource, /className="relative z-10/);
  // Hairline separator rather than a glow edge.
  assert.match(sidebarSource, /border-r border-\[#2A2925\]/);
  // Yellow is reserved for the active item; idle labels are warm off-white.
  assert.match(sidebarSource, /bg-\[#F2B705\] text-\[#151513\]/);
  assert.match(sidebarSource, /text-\[#C9C3B6\]/);
  assert.doesNotMatch(sidebarSource, /text-neutral-300/);
  assert.doesNotMatch(sidebarSource, /bg-neutral-950/);
  assert.doesNotMatch(sidebarSource, /#12363a/);
});
