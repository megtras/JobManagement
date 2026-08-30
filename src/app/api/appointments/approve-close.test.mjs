import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const approveRoute = readFileSync(new URL("./[id]/approve/route.ts", import.meta.url), "utf8");
const navConfig = readFileSync(new URL("../../../components/layout/navConfig.ts", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../../../proxy.ts", import.meta.url), "utf8");
const customersAction = readFileSync(new URL("../../../lib/actions/customers.ts", import.meta.url), "utf8");
const appointmentsAction = readFileSync(new URL("../../../lib/actions/appointments.ts", import.meta.url), "utf8");
const dashboardRoute = readFileSync(new URL("../dashboard/route.ts", import.meta.url), "utf8");

test("approve-and-close route finalises the job and approves pending payments", () => {
  assert.match(approveRoute, /export async function POST/);
  assert.match(approveRoute, /if \(role === "TECHNICIAN"\) return/);
  assert.match(approveRoute, /appt\.status !== "DONE"/);
  assert.match(approveRoute, /if \(appt\.approvedAt\)/);
  assert.match(approveRoute, /approvedAt: new Date\(\), approvedById: userId/);
  assert.match(approveRoute, /prisma\.payment\.updateMany\(\{[\s\S]*status: "PENDING"[\s\S]*status: "APPROVED"/);
});

test("manager and admin share the supervisor menu; technician is separate", () => {
  assert.match(navConfig, /const STAFF_NAV: NavItem\[\]/);
  assert.match(navConfig, /SUPERVISOR: STAFF_NAV/);
  assert.match(navConfig, /MANAGER: STAFF_NAV/);
  assert.match(navConfig, /ADMIN: STAFF_NAV/);
  assert.match(navConfig, /TECHNICIAN: \[/);
});

test("proxy restricts only technicians; staff reach every management page", () => {
  assert.match(proxy, /if \(role === "TECHNICIAN"\)/);
  assert.match(proxy, /applicationPath\.startsWith\("\/tasks"\)/);
  // the old supervisor-only gates on /users, /inventory, /dashboard are gone
  assert.doesNotMatch(proxy, /applicationPath\.startsWith\("\/users"\)[\s\S]*role !== "SUPERVISOR"/);
  assert.doesNotMatch(proxy, /applicationPath\.startsWith\("\/dashboard"\)[\s\S]*role !== "MANAGER"/);
});

test("staff write actions allow Admin and branch-scope non-supervisors", () => {
  // create/update/delete now block only technicians
  assert.match(customersAction, /if \(role === "TECHNICIAN"\) throw new Error\("Unauthorized"\)/);
  assert.match(appointmentsAction, /if \(role === "TECHNICIAN"\) throw new Error\("Unauthorized"\)/);
  // branch ownership checks cover Admin too (not just Manager)
  assert.match(customersAction, /role !== "SUPERVISOR" && customer\.branchId !== branchId/);
  assert.match(appointmentsAction, /role !== "SUPERVISOR" && (customer|appt)\.branchId !== branchId/);
  assert.doesNotMatch(customersAction, /role === "MANAGER" && customer\.branchId/);
  // dashboard open to Admin
  assert.match(dashboardRoute, /if \(role === "TECHNICIAN"\) \{/);
});
