import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modalSource = readFileSync(new URL("./AppointmentModal.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/appointments/[id]/route.ts", import.meta.url), "utf8");

test("edit appointment submits through the appointment PUT route", () => {
  assert.match(routeSource, /export async function PUT/);
  assert.match(modalSource, /fetch\(`\/api\/appointments\/\$\{editing\.id\}`,\s*\{\s*method: "PUT"/);
  assert.doesNotMatch(modalSource, /await updateAppointment\(editing\.id,/);
});

test("edit appointment PUT payload keeps existing asset ids so category edits replace the same asset", () => {
  assert.match(routeSource, /assets: Array<\{[\s\S]*id\?: string;/);
  assert.match(modalSource, /const assets = validAssets\.map\(\(asset\) => \(\{[\s\S]*id: asset\.id,/);
});

test("appointment modal uses one time dropdown on every screen size", () => {
  // A single <select> replaces the desktop segmented spinner and the mobile
  // typing picker: on a phone it opens the OS wheel in one tap.
  assert.match(modalSource, /function TimeSelect/);
  assert.match(modalSource, /const TIME_OPTIONS = Array\.from/);
  assert.match(modalSource, /<TimeSelect[\s\S]*ariaLabel="Time Start"/);
  assert.match(modalSource, /<TimeSelect[\s\S]*ariaLabel="Time Finish"/);
  // No screen-size split and none of the old picker machinery survives.
  assert.doesNotMatch(modalSource, /TimeSpinnerInput|MobileTimePickerInput/);
  assert.doesNotMatch(modalSource, /inputMode="text"/);
  assert.doesNotMatch(modalSource, /<input type="time"/);
});

test("time dropdown keeps an off-grid saved time selectable", () => {
  // An appointment saved at 09:24 is not on the 15-minute grid; opening the
  // form must not silently round or blank it.
  assert.match(modalSource, /if \(!value \|\| TIME_OPTIONS\.some\(\(option\) => option\.value === value\)\) return TIME_OPTIONS;/);
  assert.match(modalSource, /\[\.\.\.TIME_OPTIONS, \{ value, label: formatTimeDisplay\(value\) \}\]/);
});
