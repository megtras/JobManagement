import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = [
  "../app/api/tasks/[id]/route.ts",
  "../app/api/tasks/[id]/start/route.ts",
  "../app/api/tasks/[id]/checkin/route.ts",
  "../app/api/tasks/[id]/photo/route.ts",
  "../app/api/tasks/[id]/payment/route.ts",
  "../app/api/tasks/[id]/report/route.ts",
];

test("technician task mutation endpoints reject updates after checkout", () => {
  for (const route of routes) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(source, /if \(appt\.clockOutAt\)/, route);
    assert.match(source, /Task already checked out/, route);
  }
});

test("payment endpoint blocks only zero-total FOC jobs, not every warranty appointment", () => {
  const source = readFileSync(new URL("../app/api/tasks/[id]/payment/route.ts", import.meta.url), "utf8");
  assert.match(source, /Number\(appt\.totalPrice\) <= 0/);
  assert.doesNotMatch(source, /appt\.billingType === "WARRANTY"/);
});
