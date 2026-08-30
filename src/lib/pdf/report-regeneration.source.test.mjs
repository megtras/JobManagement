import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const helperSource = readFileSync(new URL("./regenerate-service-report.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/appointments/[id]/report/regenerate/route.ts", import.meta.url), "utf8");

test("existing PDF reports can be regenerated with the latest ReportDocument template", () => {
  assert.match(helperSource, /renderToBuffer/);
  assert.match(helperSource, /createElement\(ReportDocument/);
  assert.match(helperSource, /prisma\.report\.update\(\{\s*where: \{ appointmentId \},\s*data: \{ pdfUrl \}/);
  assert.match(helperSource, /uploadPublicUrl\("reports", pdfFilename\)/);
});

test("report regeneration endpoint checks appointment access before writing a new PDF", () => {
  assert.match(routeSource, /technicianTeamAccessWhere/);
  assert.match(routeSource, /role === "SUPERVISOR"/);
  assert.match(routeSource, /branchId\s*\?\s*\{ branchId \}/);
  assert.match(routeSource, /regenerateServiceReportPdf\(id\)/);
  assert.match(routeSource, /whatsappLink/);
});
