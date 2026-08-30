import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const taskDetailSource = readFileSync(new URL("./TaskDetailClient.tsx", import.meta.url), "utf8");
const taskApiSource = readFileSync(new URL("../../app/api/tasks/[id]/route.ts", import.meta.url), "utf8");

test("task detail can receive full customer and appointment metadata", () => {
  assert.match(taskDetailSource, /phone2\?: string \| null/);
  assert.match(taskDetailSource, /email\?: string \| null/);
  assert.match(taskDetailSource, /jobTitle: string/);
  assert.match(taskDetailSource, /propertyType\?: string \| null/);
  assert.match(taskDetailSource, /workLocationAddress\?: string \| null/);
  assert.match(taskDetailSource, /workLocationLat\?: number \| null/);
  assert.match(taskDetailSource, /workLocationLng\?: number \| null/);

  assert.match(taskApiSource, /customer: true/);
  assert.match(taskApiSource, /assets: \{ include: \{ jobCategory/);
  assert.match(taskApiSource, /buildWazeLink/);
  // ownership is resolved through the assigned team: either roster membership or
  // the shared team account name matching the assigned team name.
  assert.match(taskApiSource, /technicianTeamAccessWhere\(session\.user\.id, session\.user\.name\)/);
});

test("task overview displays labelled client details for technicians", () => {
  assert.match(taskDetailSource, />Customer Details</);
  assert.match(taskDetailSource, />Phone Number 1</);
  assert.match(taskDetailSource, />Phone Number 2 \(Emergency\)</);
  assert.match(taskDetailSource, />Email</);
  assert.match(taskDetailSource, />District</);
  assert.match(taskDetailSource, />Address</);
  assert.match(taskDetailSource, /task\.locationAddress/);
  assert.match(taskDetailSource, /buildWazeLink/);
  assert.match(taskDetailSource, /whatsappLink\(task\.customer\.phone2\)/);
  assert.match(taskDetailSource, /Emergency contact not available/);
  assert.doesNotMatch(taskDetailSource, /<p className="text-sm text-gray-500">\{task\.customer\.area\}<\/p>/);
});

test("task overview groups every work location by property type and assets", () => {
  assert.match(taskDetailSource, /export function buildTaskWorkLocations/);
  assert.match(taskDetailSource, /interface WorkLocationGroup/);
  assert.match(taskDetailSource, /asset\.workLocationAddress/);
  assert.match(taskDetailSource, /propertyGroups: PropertyAssetGroup\[\]/);
  assert.match(taskDetailSource, /workLocations\.length\} address/);
  assert.match(taskDetailSource, /Location \{locIdx \+ 1\}/);
  assert.match(taskDetailSource, /loc\.propertyGroups\.map/);
  assert.match(taskDetailSource, />Property Type</);
  assert.match(taskDetailSource, />Asset Type</);
  assert.match(taskDetailSource, />Job Category</);
  assert.match(taskDetailSource, /photo\?\.label \|\| `Photo \$\{index \+ 1\}`/);
  assert.match(taskDetailSource, /group\.assets\.map/);
  assert.match(taskDetailSource, /Open Waze/);
  assert.doesNotMatch(taskDetailSource, /loc\.assets\.map/);
});
