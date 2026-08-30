import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(new URL("./AppointmentsClient.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../app/(application)/(system)/appointments/page.tsx", import.meta.url), "utf8");

test("appointments page derives job status from payment approval and clock-in like dashboard", () => {
  assert.match(clientSource, /clockIn: string \| null;/);
  assert.match(clientSource, /clockOut: string \| null;/);
  assert.match(clientSource, /function deriveJobStatus\(row: \{ status\?: string; clockIn: string \| null; payment: \{ status: string \} \| null \}\): keyof typeof STATUS_CONFIG/);
  assert.match(clientSource, /if \(row\.payment\?\.status === "APPROVED"\) return "DONE";/);
  assert.match(clientSource, /if \(row\.clockIn\) return "IN_PROGRESS";/);
  assert.match(clientSource, /return "COMING_SOON";/);
  assert.match(clientSource, /const jobStatus = deriveJobStatus\(a\);/);
  assert.match(clientSource, /deriveJobStatus\(a\) === appointmentFilter/);
  assert.match(clientSource, /const comingCount = periodScoped\.filter\(\(a\) => deriveJobStatus\(a\) === "COMING_SOON"\)\.length;/);
  assert.match(clientSource, /const progressCount = periodScoped\.filter\(\(a\) => deriveJobStatus\(a\) === "IN_PROGRESS"\)\.length;/);
  assert.match(clientSource, /const doneCount = periodScoped\.filter\(\(a\) => deriveJobStatus\(a\) === "DONE"\)\.length;/);
  assert.match(clientSource, /STATUS_CONFIG\[jobStatus\]/);
  assert.match(pageSource, /clockIn: a\.clockInAt \? a\.clockInAt\.toISOString\(\) : null,/);
  assert.match(pageSource, /clockOut: a\.clockOutAt \? a\.clockOutAt\.toISOString\(\) : null,/);
});

test("appointments page displays FOC from chargeable total, not warranty context alone", () => {
  assert.match(clientSource, /return a\.totalPrice <= 0 \? "FOC" : `RM \$\{a\.totalPrice\.toFixed\(2\)\}`/);
  assert.match(clientSource, /const isFullyFoc = a\.totalPrice <= 0/);
  assert.match(clientSource, /if \(isWarranty && isFullyFoc\)/);
});
