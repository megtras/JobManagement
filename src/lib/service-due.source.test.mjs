import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readSource(url) {
  try {
    return readFileSync(url, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

const helperSource = readSource(new URL("./service-due.ts", import.meta.url));
const dashboardRouteSource = readFileSync(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8");
const dashboardClientSource = readFileSync(new URL("../components/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const notificationsRouteSource = readFileSync(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8");
const notificationsClientSource = readFileSync(new URL("../components/notifications/NotificationsClient.tsx", import.meta.url), "utf8");
const customersPageSource = readFileSync(new URL("../app/(application)/(system)/customers/page.tsx", import.meta.url), "utf8");
const customersClientSource = readFileSync(new URL("../components/customers/CustomersClient.tsx", import.meta.url), "utf8");

test("service due helper detects customers whose latest completed service is at least six months old", () => {
  assert.match(helperSource, /export const SERVICE_DUE_TYPE = "SERVICE_DUE"/);
  assert.match(helperSource, /export const SERVICE_DUE_MONTHS = 6/);
  assert.match(helperSource, /export function serviceCompletedAt/);
  assert.match(helperSource, /appointment\.clockOutAt \?\? appointment\.approvedAt \?\? appointment\.date/);
  assert.match(helperSource, /export function serviceDueDate\(completedAt: Date\)/);
  assert.match(helperSource, /due\.setMonth\(due\.getMonth\(\) \+ SERVICE_DUE_MONTHS\)/);
  assert.match(helperSource, /export async function getServiceDueCustomerSummaries/);
  assert.match(helperSource, /status: "DONE"/);
  assert.match(helperSource, /orderBy: \[\{ customerId: "asc" \}, \{ clockOutAt: "desc" \}, \{ date: "desc" \}\]/);
  assert.match(helperSource, /latestByCustomer\.has\(appointment\.customerId\)/);
  assert.match(helperSource, /serviceDueDate\(completedAt\) <= today/);
});

test("service due notifications go to supervisors and branch management without duplicates", () => {
  assert.match(helperSource, /export async function notifyServiceDueCustomers/);
  assert.match(helperSource, /role: \{ in: \["ADMIN", "MANAGER"\] \}, branchId: summary\.branchId/);
  assert.match(helperSource, /\{ role: "SUPERVISOR" \}/);
  assert.match(helperSource, /type: SERVICE_DUE_TYPE/);
  assert.match(helperSource, /relatedAppointmentId: summary\.appointmentId/);
  assert.match(helperSource, /existingRecipientIds/);
  assert.match(helperSource, /Service due reminder for/);
  assert.match(notificationsRouteSource, /await notifyServiceDueCustomers\(\)/);
  assert.match(notificationsClientSource, /SERVICE_DUE:\s*\{ icon: CalendarClock, color: "text-teal-600"\s*\}/);
  assert.match(notificationsClientSource, /notification\.type === "SERVICE_DUE"\s*\?\s*"\/customers\?serviceDue=1"/);
});

test("dashboard exposes and links service due reminders for management users", () => {
  assert.match(dashboardRouteSource, /import \{ getServiceDueCustomerSummaries, notifyServiceDueCustomers \} from "@\/lib\/service-due"/);
  assert.match(dashboardRouteSource, /await notifyServiceDueCustomers\(managementScope\)/);
  assert.match(dashboardRouteSource, /const serviceDueSummaries = await getServiceDueCustomerSummaries/);
  assert.match(dashboardRouteSource, /serviceDueCount: serviceDueSummaries\.length/);
  assert.match(dashboardClientSource, /serviceDueCount: number/);
  assert.match(dashboardClientSource, /statServiceDueCount > 0 \?/);
  assert.match(dashboardClientSource, /<Link href="\/customers\?serviceDue=1"/);
  assert.match(dashboardClientSource, /Service Due/);
  assert.match(dashboardClientSource, /Customers due for follow-up/);
});

test("customers page can filter due customers and inspect every previous appointment", () => {
  assert.match(customersPageSource, /searchParams: Promise<\{\s*serviceDue\?: string\s*\}>/);
  assert.match(customersPageSource, /const initialServiceDueOnly = serviceDue === "1"/);
  assert.match(customersPageSource, /const \{ appointments, jobCategory, \.\.\.customer \} = c/);
  assert.match(customersPageSource, /serviceHistory: appointments\.map/);
  assert.doesNotMatch(customersPageSource, /\.\.\.c,/);
  assert.match(customersClientSource, /initialServiceDueOnly\?: boolean/);
  assert.match(customersClientSource, /serviceHistory: ServiceHistoryItem\[\]/);
  assert.match(customersClientSource, /const \[serviceDueOnly, setServiceDueOnly\] = useState\(initialServiceDueOnly\)/);
  assert.match(customersClientSource, /\.filter\(\(c\) => !serviceDueOnly \|\| c\.serviceDue\)/);
  assert.match(customersClientSource, /Service Due/);
  assert.match(customersClientSource, /Service History/);
  assert.match(customersClientSource, /View Appointment/);
  assert.match(customersClientSource, /serviceHistory\.map/);
});
