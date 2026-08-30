import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("dashboard jobs table data is not period-limited so client search can scan all jobs", () => {
  assert.match(source, /\/\/ Jobs table data \(all periods; the client applies period filtering unless searching\)/);
  assert.match(source, /prisma\.appointment\.findMany\(\{\s*where: \{ \.\.\.branchFilter, \.\.\.teamFilter \},/);
  assert.doesNotMatch(source, /\/\/ Jobs table data\s*prisma\.appointment\.findMany\(\{\s*where: \{ \.\.\.branchFilter, \.\.\.teamFilter, date: \{ gte: start, lte: end \} \},/);
});

test("dashboard revenue uses the appointment total for approved payments", () => {
  assert.match(source, /status: "APPROVED"[\s\S]*totalPrice: true/);
  assert.match(source, /const periodRevenue = revenueSeries\.reduce\(\(sum, payment\) => sum \+ Number\(payment\.appointment\.totalPrice\), 0\)/);
  assert.match(source, /revenue:\s*periodRevenue\.toFixed\(2\)/);
  assert.match(source, /revenueMap\[slot\]\[bid\] = \(revenueMap\[slot\]\[bid\] \?\? 0\) \+ Number\(payment\.appointment\.totalPrice\)/);
  assert.match(source, /\.reduce\(\(s, p\) => s \+ Number\(p\.appointment\.totalPrice\), 0\)/);
  assert.doesNotMatch(source, /revenueResult/);
  assert.doesNotMatch(source, /_sum: \{ amount: true \}/);
});

test("dashboard exposes pending SOS check-in count for staff notification banner", () => {
  assert.match(source, /const checkInSosCount = await prisma\.appointment\.count\(\{/);
  assert.match(source, /checkInSosRequestedAt: \{ not: null \}/);
  assert.match(source, /checkInSosResolvedAt: null/);
  assert.match(source, /checkIns: \{ none: \{\} \}/);
  assert.match(source, /checkInSosCount,/);
});
