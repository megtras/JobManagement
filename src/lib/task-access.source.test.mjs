import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const helperUrl = new URL("./task-access.ts", import.meta.url);
const taskRoutes = [
  "../app/api/tasks/route.ts",
  "../app/api/tasks/[id]/route.ts",
  "../app/api/tasks/[id]/start/route.ts",
  "../app/api/tasks/[id]/checkin/route.ts",
  "../app/api/tasks/[id]/checkout/route.ts",
  "../app/api/tasks/[id]/photo/route.ts",
  "../app/api/tasks/[id]/payment/route.ts",
  "../app/api/tasks/[id]/report/route.ts",
];
const technicianDashboardPage = "../app/(application)/(system)/dashboard/page.tsx";

test("technician task access matches assigned team name or roster membership", () => {
  assert.equal(existsSync(helperUrl), true);
  const helperSource = readFileSync(helperUrl, "utf8");

  assert.match(helperSource, /export function technicianTeamAccessWhere/);
  assert.match(helperSource, /name: userName/);
  assert.match(helperSource, /members: \{ some: \{ id: userId \} \}/);
});

test("all technician task endpoints use the shared team access filter", () => {
  for (const route of taskRoutes) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /technicianTeamAccessWhere\(session\.user\.id, session\.user\.name\)/, route);
    assert.doesNotMatch(source, /teams: \{ some: \{ members: \{ some: \{ id: session\.user\.id \} \} \} \}/, route);
  }
});

test("technician dashboard uses the shared team access filter", () => {
  const source = readFileSync(new URL(technicianDashboardPage, import.meta.url), "utf8");

  assert.match(source, /technicianTeamAccessWhere\(session!\.user\.id, session!\.user\.name\)/);
  assert.doesNotMatch(source, /teams: \{ some: \{ members: \{ some: \{ id: techId \} \} \} \}/);
});

test("technician dashboard receives all tasks for client-side period filtering", () => {
  const source = readFileSync(new URL(technicianDashboardPage, import.meta.url), "utf8");

  assert.match(source, /status: a\.status/);
  assert.match(source, /tasks=\{tasks\}/);
  assert.doesNotMatch(source, /\.filter\(\(a\) => a\.status === "DONE"\)[\s\S]*\.slice\(0, 8\)/);
  assert.doesNotMatch(source, /stats=\{stats\}/);
});

test("technician dashboard welcome name does not append team groups", () => {
  const source = readFileSync(new URL(technicianDashboardPage, import.meta.url), "utf8");

  assert.match(source, /userName=\{session!\.user\.name \?\? "there"\}/);
  assert.doesNotMatch(source, /userName=\{session!\.user\.teamName/);
});
