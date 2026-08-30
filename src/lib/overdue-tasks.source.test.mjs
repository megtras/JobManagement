import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const helperUrl = new URL("./overdue-tasks.ts", import.meta.url);
const tasksRouteSource = readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
const notificationsRouteSource = readFileSync(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8");
const notificationsClientSource = readFileSync(new URL("../components/notifications/NotificationsClient.tsx", import.meta.url), "utf8");
const dashboardPageSource = readFileSync(new URL("../app/(application)/(system)/dashboard/page.tsx", import.meta.url), "utf8");

test("technician task API excludes overdue unfinished work from team task lists", () => {
  assert.match(tasksRouteSource, /const today = startOfToday\(\)/);
  assert.match(tasksRouteSource, /status: \{ in: \["COMING_SOON", "IN_PROGRESS"\] \}/);
  assert.match(tasksRouteSource, /date: \{ gte: today \}/);
  assert.doesNotMatch(tasksRouteSource, /\{ status: \{ in: \["COMING_SOON", "IN_PROGRESS"\] \} \}/);
  assert.doesNotMatch(tasksRouteSource, /sevenDaysAgo/);
  assert.doesNotMatch(tasksRouteSource, /\{ status: "DONE"/);
  assert.match(dashboardPageSource, /const today = startOfToday\(\)/);
  assert.match(dashboardPageSource, /\{ status: \{ in: \["COMING_SOON", "IN_PROGRESS"\] \}, date: \{ gte: today \} \}/);
});

test("overdue unfinished work notifies management once for rescheduling", () => {
  assert.equal(existsSync(helperUrl), true);
  const helperSource = readFileSync(helperUrl, "utf8");

  assert.match(helperSource, /export function startOfToday/);
  assert.match(helperSource, /export async function notifyOverdueTasksForReschedule/);
  assert.match(helperSource, /status: \{ in: \["COMING_SOON", "IN_PROGRESS"\] \}/);
  assert.match(helperSource, /date: \{ lt: today \}/);
  assert.match(helperSource, /const OVERDUE_TASK_TYPE = "OVERDUE_TASK"/);
  assert.match(helperSource, /type: OVERDUE_TASK_TYPE/);
  assert.match(helperSource, /role: \{ in: \["ADMIN", "MANAGER"\] \}, branchId: appt\.branchId/);
  assert.match(helperSource, /\{ role: "SUPERVISOR" \}/);
  assert.match(helperSource, /existingRecipientIds/);
  assert.match(helperSource, /createMany/);

  assert.match(tasksRouteSource, /await notifyOverdueTasksForReschedule\(\)/);
  assert.match(notificationsRouteSource, /await notifyOverdueTasksForReschedule\(\)/);
  assert.match(dashboardPageSource, /await notifyOverdueTasksForReschedule\(\)/);
  assert.match(notificationsClientSource, /OVERDUE_TASK:\s*\{ icon: AlertTriangle, color: "text-amber-600"\s*\}/);
});
