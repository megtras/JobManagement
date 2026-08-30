import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const reportRouteSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const publicUrlSource = readFileSync(new URL("../../../../../lib/public-url.ts", import.meta.url), "utf8");

test("pdf report whatsapp share link uses the Malaysia country code", () => {
  // The share link is built by the shared whatsappReportLink() helper.
  assert.ok(reportRouteSource.includes("whatsappReportLink(appt.customer.phone, pdfUrl, req)"));
  assert.ok(publicUrlSource.includes("https://wa.me/60"));
  assert.ok(!publicUrlSource.includes("https://wa.me/6${"));
  assert.ok(publicUrlSource.includes('replace(/^0/, "")'));
  assert.ok(publicUrlSource.includes('replace(/\\D/g, "")'));
});

test("pdf report branding no longer passes branch name into the document", () => {
  assert.ok(!reportRouteSource.includes("branchName: appt.branch.name"));
});
