import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const appointmentActions = readFileSync(new URL("../lib/actions/appointments.ts", import.meta.url), "utf8");
const appointmentModal = readFileSync(new URL("../components/appointments/AppointmentModal.tsx", import.meta.url), "utf8");
const appointmentRoute = readFileSync(new URL("../app/api/appointments/[id]/route.ts", import.meta.url), "utf8");
const appointmentsPage = readFileSync(new URL("../app/(application)/(system)/appointments/page.tsx", import.meta.url), "utf8");
const appointmentsClient = readFileSync(new URL("../components/appointments/AppointmentsClient.tsx", import.meta.url), "utf8");
const dashboardRoute = readFileSync(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8");
const taskRoute = readFileSync(new URL("../app/api/tasks/[id]/route.ts", import.meta.url), "utf8");
const taskClient = readFileSync(new URL("../components/tasks/TaskDetailClient.tsx", import.meta.url), "utf8");
const taskPaymentRoute = readFileSync(new URL("../app/api/tasks/[id]/payment/route.ts", import.meta.url), "utf8");
const taskReportRoute = readFileSync(new URL("../app/api/tasks/[id]/report/route.ts", import.meta.url), "utf8");
const reportDocument = readFileSync(new URL("../lib/pdf/ReportDocument.tsx", import.meta.url), "utf8");

test("schema stores appointment billing type and optional warranty note", () => {
  assert.match(schema, /enum BillingType \{\s*CHARGEABLE\s*WARRANTY\s*\}/);
  assert.match(schema, /billingType\s+BillingType\s+@default\(CHARGEABLE\)/);
  assert.match(schema, /warrantyNote\s+String\?/);
  assert.match(schema, /@@index\(\[billingType\]\)/);
});

test("appointment create and update persist warranty context and per-asset billing", () => {
  assert.match(appointmentActions, /billingType\?: "CHARGEABLE" \| "WARRANTY"/);
  assert.match(appointmentActions, /function normalizeBillingType/);
  assert.match(appointmentActions, /const billingType = normalizeBillingType\(data\.billingType\)/);
  assert.match(appointmentActions, /calculateChargeableAssetTotal/);
  assert.match(appointmentActions, /billingType: asset\.billingType/);
  assert.match(appointmentActions, /billingType,/);
  assert.match(appointmentActions, /warrantyNote: normalizeWarrantyNote\(data\.warrantyNote\)/);
  assert.match(appointmentRoute, /billingType\?: "CHARGEABLE" \| "WARRANTY"/);
  assert.match(appointmentRoute, /warrantyNote\?: string \| null/);
});

test("appointment modal exposes warranty billing and sends it in create and edit payloads", () => {
  assert.match(appointmentModal, /const \[billingType, setBillingType\] = useState<"CHARGEABLE" \| "WARRANTY">\("CHARGEABLE"\)/);
  assert.match(appointmentModal, /const \[warrantyNote, setWarrantyNote\] = useState\(""\)/);
  assert.match(appointmentModal, /Warranty \/ FOC/);
  assert.match(appointmentModal, /No payment will be collected/);
  assert.match(appointmentModal, /\.filter\(\(asset\) => asset\.billingType === "CHARGEABLE"\)/);
  assert.match(appointmentModal, /billingType, warrantyNote: warrantyNote\.trim\(\) \|\| undefined/);
  assert.match(appointmentModal, /FOC/);
});

test("appointment and dashboard lists show FOC only when chargeable total is zero", () => {
  assert.match(appointmentsPage, /billingType: a\.billingType/);
  assert.match(appointmentsPage, /warrantyNote: a\.warrantyNote/);
  assert.match(appointmentsClient, /billingType: "CHARGEABLE" \| "WARRANTY"/);
  assert.match(appointmentsClient, /const isWarranty = a\.billingType === "WARRANTY"/);
  assert.match(appointmentsClient, /const isFullyFoc = a\.totalPrice <= 0/);
  assert.match(appointmentsClient, /Warranty/);
  assert.match(appointmentsClient, /FOC/);
  assert.match(dashboardRoute, /billingType: true/);
  assert.match(dashboardRoute, /warrantyNote: true/);
});

test("technician task flow skips payment only when chargeable total is zero", () => {
  assert.match(taskRoute, /billingType: task\.billingType/);
  assert.match(taskRoute, /warrantyNote: task\.warrantyNote/);
  assert.match(taskClient, /billingType: "CHARGEABLE" \| "WARRANTY"/);
  assert.match(taskClient, /const isWarranty = task\.billingType === "WARRANTY"/);
  assert.match(taskClient, /const paymentStepVisible = paymentRequired && \(hasPayment \|\| showPaymentStep\)/);
  assert.match(taskClient, /const signatureStepVisible = \(hasPayment \|\| \(isFullyFoc && hasEnoughPhotos\)\) && !isDone/);
  assert.match(taskClient, /covered under warranty/i);
  assert.match(taskPaymentRoute, /Number\(appt\.totalPrice\) <= 0/);
  assert.match(taskPaymentRoute, /Payment is not required for FOC jobs/);
});

test("service report prints item billing and chargeable totals", () => {
  assert.match(taskReportRoute, /billingType: appt\.billingType/);
  assert.match(taskReportRoute, /warrantyNote: appt\.warrantyNote/);
  assert.match(taskReportRoute, /billingType: a\.billingType \?\? null/);
  assert.match(reportDocument, /billingType: "CHARGEABLE" \| "WARRANTY"/);
  assert.match(reportDocument, /No payment required/);
  assert.match(reportDocument, /FOC \(Warranty\)/);
  assert.match(reportDocument, /Total Chargeable/);
});
