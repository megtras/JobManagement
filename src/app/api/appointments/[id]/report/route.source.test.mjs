import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const pageSource = readFileSync(
  new URL("../../../../(application)/(system)/appointments/[id]/page.tsx", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("../../../../../components/appointments/AppointmentDetailClient.tsx", import.meta.url),
  "utf8",
);

test("completed report editing is restricted to admin, manager and supervisor", () => {
  assert.match(routeSource, /const REPORT_EDITOR_ROLES = new Set\(\["ADMIN", "MANAGER", "SUPERVISOR"\]\)/);
  assert.match(routeSource, /if \(!REPORT_EDITOR_ROLES\.has\(session\.user\.role\)\)/);
  assert.match(routeSource, /role !== "SUPERVISOR" && branchId \? \{ branchId \} : \{\}/);
  assert.match(routeSource, /appt\.status !== "DONE" \|\| !appt\.report/);
});

test("report edits persist signed metadata and after-task content before regenerating the PDF", () => {
  assert.match(routeSource, /prisma\.report\.update/);
  assert.match(routeSource, /data: \{ technicianName, clientName, reportDate \}/);
  assert.match(routeSource, /prisma\.appointmentAsset\.update/);
  assert.match(routeSource, /technicianRemark: asset\.technicianRemark \|\| null/);
  assert.match(routeSource, /prisma\.servicePhoto\.update/);
  assert.match(routeSource, /data: \{ label: photo\.label \}/);
  assert.match(routeSource, /pdfUrl = await regenerateServiceReportPdf\(id\)/);
});

test("appointment detail exposes an editable report form only to management roles", () => {
  assert.match(pageSource, /const canEditReport = role === "ADMIN" \|\| role === "MANAGER" \|\| role === "SUPERVISOR"/);
  assert.match(pageSource, /canEditReport=\{canEditReport\}/);
  assert.match(detailSource, /\{canEditReport && \(/);
  assert.match(detailSource, />\s*Edit report\s*<\/button>/);
  assert.match(detailSource, /fetch\(`\/api\/appointments\/\$\{appointmentId\}\/report`, \{\s*method: "PATCH"/);
  assert.match(detailSource, /Original signatures are retained/);
  assert.match(detailSource, /Save report/);
});
