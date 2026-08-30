import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const taskSource = readFileSync(new URL("./TaskDetailClient.tsx", import.meta.url), "utf8");
const taskRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/route.ts", import.meta.url), "utf8");
const workItemsRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/work-items/route.ts", import.meta.url), "utf8");

test("technician can add a post-troubleshoot work item inside the same task", () => {
  assert.match(taskRouteSource, /jobCategories/);
  assert.match(workItemsRouteSource, /export async function POST/);
  assert.match(workItemsRouteSource, /technicianTeamAccessWhere/);
  assert.match(workItemsRouteSource, /calculateChargeableAssetTotal/);
  assert.match(workItemsRouteSource, /appt\.billingType === "WARRANTY" \? requestedBillingType : "CHARGEABLE"/);
  assert.match(workItemsRouteSource, /billingType,/);
  assert.match(taskSource, /Continue Repair/);
  assert.match(taskSource, /Stop Task/);
  assert.match(taskSource, /action: "work-item",[\s\S]*url: `\/api\/tasks\/\$\{taskId\}\/work-items`/);
});
