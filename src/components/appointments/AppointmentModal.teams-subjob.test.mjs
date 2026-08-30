import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const modalSource = readFileSync(new URL("./AppointmentModal.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../../lib/actions/appointments.ts", import.meta.url), "utf8");
const teamsActionSource = readFileSync(new URL("../../lib/actions/teams.ts", import.meta.url), "utf8");
const teamModalSource = readFileSync(new URL("../teams/TeamModal.tsx", import.meta.url), "utf8");

test("modal categorises assets by AC type with per-asset job category, price and remarks", () => {
  assert.match(modalSource, /const AC_TYPES = \["Wall Mounted", "Cassette", "Exposed", "Ducting", "Wiring"\]/);
  assert.match(modalSource, /<select value=\{asset\.acType\}/);
  assert.match(modalSource, /<select value=\{asset\.jobCategoryId\}/);
  assert.match(modalSource, /function selectAssetCategory/);
  // price prefills from the chosen category but stays editable
  assert.match(modalSource, /unitPrice: price != null \? String\(price\) : ""/);
  assert.match(modalSource, /type="number"/);
  assert.match(modalSource, /placeholder="Remarks \(optional\)"/);
});

test("new appointment assets keep the visible default AC type in state", () => {
  assert.match(modalSource, /return \{ _key: nk\(\), label: "", acType: AC_TYPES\[0\], jobCategoryId: "", unitPrice: "", remarks: "" \};/);
  assert.match(modalSource, /<option value="" disabled>Select category<\/option>/);
});

test("modal exposes start + finish time side by side", () => {
  assert.match(modalSource, /const \[time, setTime\] = useState\("09:00"\)/);
  assert.match(modalSource, /const \[timeFinish, setTimeFinish\] = useState/);
  assert.match(modalSource, /grid grid-cols-2/);
  assert.match(modalSource, />Time Start</);
  assert.match(modalSource, />Time Finish /);
});

test("modal supports sub-job mode and editable work-location address", () => {
  assert.match(modalSource, /const isSubJob = !!parentId/);
  assert.match(modalSource, /preselectedCustomerId\?: string/);
  assert.match(modalSource, /parentId\?: string/);
  assert.match(modalSource, /createAppointment\(\{[\s\S]*parentId/);
  assert.match(modalSource, /Create Sub Job/);
  // each work location has an edit affordance that re-opens the address picker
  assert.match(modalSource, /setLocationPicker\(\{ mode: "edit", key: location\._key \}\)/);
  assert.match(modalSource, /<Pencil className="w-3\.5 h-3\.5" \/> Edit/);
});

test("create appointment validates teams belong to the customer branch", () => {
  assert.match(actionSource, /async function assertTeamsInBranch/);
  assert.match(actionSource, /The team must belong to the same branch\./);
  assert.match(actionSource, /const primaryCategoryId = assets\[0\]\?\.jobCategoryId \?\? null/);
  assert.match(actionSource, /parent: \{ connect: \{ id: data\.parentId \} \}/);
  // no pre-gate on closed deal — setting an appointment closes a pending deal
  assert.doesNotMatch(actionSource, /not yet a closed deal/);
  assert.match(actionSource, /data: \{ status: "CLOSED" \}/);
});

test("team actions manage roster membership", () => {
  assert.match(teamsActionSource, /export async function getTeams/);
  assert.match(teamsActionSource, /export async function createTeam/);
  assert.match(teamsActionSource, /export async function updateTeam/);
  assert.match(teamsActionSource, /export async function deleteTeam/);
  assert.match(teamsActionSource, /members: \{ connect: memberIds\.map/);
  assert.match(teamsActionSource, /members: \{ set: memberIds\.map/);
  assert.match(teamModalSource, /createTeam|updateTeam/);
});
