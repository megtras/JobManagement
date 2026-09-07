import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const reportDocumentSource = readFileSync(new URL("./ReportDocument.tsx", import.meta.url), "utf8");
const reportRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/report/route.ts", import.meta.url), "utf8");
const regenerateReportSource = readFileSync(new URL("./regenerate-service-report.ts", import.meta.url), "utf8");

test("each serviced asset renders as labeled fields in the PDF report", () => {
  // The old single combined line is gone; each asset is a labeled field list.
  assert.doesNotMatch(reportDocumentSource, /styles\.remarkRow/);
  assert.match(reportDocumentSource, />Asset Type<\/Text>/);
  assert.match(reportDocumentSource, />Job Category<\/Text>/);
  assert.match(reportDocumentSource, />Remark<\/Text>/);
  assert.match(reportDocumentSource, />Property Type<\/Text>/);
  assert.match(reportDocumentSource, />Work Progress Photos<\/Text>/);
  assert.match(reportDocumentSource, />Technician Remark<\/Text>/);
  // Technician remark falls back to "-"; evidence photos use technician labels with Photo 1/2/3 fallback.
  assert.match(reportDocumentSource, /\{a\.technicianRemark \|\| "-"\}/);
  assert.match(reportDocumentSource, /\{photo\.label \|\| `Photo \$\{j \+ 1\}`\}/);
  assert.match(reportDocumentSource, /jobCategoryName\?: string \| null/);
});

test("pdf report header shows the Megtras logo, title, and company address/phone", () => {
  assert.match(reportDocumentSource, /import \{ MEGTRAS_LOGO_DATA_URI \} from "\.\/megtras-logo-data"/);
  // Logo image renders immediately above the Megtras title.
  assert.match(reportDocumentSource, /<Image src=\{MEGTRAS_LOGO_DATA_URI\} style=\{styles\.logo\} \/>\s*<Text style=\{styles\.title\}>Megtras<\/Text>/);
  assert.doesNotMatch(reportDocumentSource, /Professional Air Conditioning Services/);
  // Company address + phone follow the title.
  assert.match(reportDocumentSource, /Blok J-03-02, Dataran Glomac,/);
  assert.match(reportDocumentSource, /Jalan SS6\/18, Ss 6,/);
  assert.match(reportDocumentSource, /47301 Petaling Jaya, Selangor/);
  assert.match(reportDocumentSource, /012-2579290/);
  assert.doesNotMatch(reportRouteSource, /branchName: appt\.branch\.name/);
});

test("appointment asset remarks are passed into generated and regenerated PDF reports", () => {
  assert.match(reportDocumentSource, /remarks\?: string \| null/);
  assert.match(reportDocumentSource, />Remark<\/Text>/);
  assert.match(reportDocumentSource, /\{a\.remarks \|\| "-"\}/);
  assert.match(reportRouteSource, /remarks: a\.remarks \?\? null/);
  assert.match(regenerateReportSource, /remarks: asset\.remarks \?\? null/);
});

test("work progress photo labels are carried into PDF captions", () => {
  assert.match(reportDocumentSource, /photos\?: \{ src: string; label: string \}\[\]/);
  assert.match(reportDocumentSource, /\{photo\.label \|\| `Photo \$\{j \+ 1\}`\}/);
  assert.match(reportRouteSource, /select: \{ id: true, photoUrl: true, type: true, assetId: true, label: true \}/);
  assert.match(reportRouteSource, /list\.push\(\{ src: dataUrl, label: photo\.label \|\| "" \}\)/);
  assert.match(regenerateReportSource, /select: \{ id: true, photoUrl: true, type: true, assetId: true, label: true \}/);
  assert.match(regenerateReportSource, /photos\.push\(\{ src: dataUrl, label: photo\.label \|\| "" \}\)/);
});

test("warranty and troubleshoot work items show per-asset billing and chargeable total", () => {
  assert.match(reportDocumentSource, /billingType\?: "CHARGEABLE" \| "WARRANTY" \| null/);
  assert.match(reportDocumentSource, /assetBillingLabel/);
  assert.match(reportDocumentSource, />Billing<\/Text>/);
  assert.match(reportDocumentSource, /FOC/);
  assert.match(reportDocumentSource, /Total Chargeable/);
  assert.match(reportRouteSource, /billingType: a\.billingType \?\? null/);
  assert.match(regenerateReportSource, /billingType: asset\.billingType \?\? null/);
});

test("long troubleshoot reports can continue onto extra PDF pages", () => {
  assert.doesNotMatch(reportDocumentSource, /style=\{styles\.assetBlock\} wrap=\{false\}/);
  assert.match(reportDocumentSource, /<View key=\{i\} style=\{styles\.assetBlock\} minPresenceAhead=\{120\}>/);
  assert.match(reportDocumentSource, /<View style=\{styles\.signatureSection\} wrap=\{false\}>/);
});
