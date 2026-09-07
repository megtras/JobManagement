import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const helperSource = readFileSync(new URL("./public-url.ts", import.meta.url), "utf8");
const taskReportRouteSource = readFileSync(new URL("../app/api/tasks/[id]/report/route.ts", import.meta.url), "utf8");
const regenerateRouteSource = readFileSync(new URL("../app/api/appointments/[id]/report/regenerate/route.ts", import.meta.url), "utf8");

test("demo report share links use the isolated local app origin", () => {
  assert.match(helperSource, /const DEFAULT_PUBLIC_APP_URL = "http:\/\/localhost:3100"/);
  assert.match(helperSource, /ENABLE_EXTERNAL_WHATSAPP !== "true"/);
  assert.doesNotMatch(helperSource, /https:\/\/genplusaircond\.my/);
  assert.match(helperSource, /function isLocalAppUrl/);
  assert.match(helperSource, /process\.env\.NEXT_PUBLIC_APP_URL/);
  assert.match(helperSource, /request\?\.headers\.get\("x-forwarded-host"\)/);
  assert.match(helperSource, /normalizeUploadUrl\(pdfUrl\)/);
  assert.match(helperSource, /Service report from Megtras/);

  assert.doesNotMatch(taskReportRouteSource, /http:\/\/localhost:3000/);
  assert.doesNotMatch(regenerateRouteSource, /http:\/\/localhost:3000/);
  assert.match(taskReportRouteSource, /whatsappReportLink\(appt\.customer\.phone, pdfUrl, req\)/);
  assert.match(regenerateRouteSource, /whatsappReportLink\(appt\.customer\.phone, pdfUrl, req\)/);
});
