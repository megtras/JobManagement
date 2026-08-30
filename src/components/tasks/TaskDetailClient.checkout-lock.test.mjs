import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskDetailSource = readFileSync(new URL("./TaskDetailClient.tsx", import.meta.url), "utf8");
const reportRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/report/route.ts", import.meta.url), "utf8");
const paymentRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/payment/route.ts", import.meta.url), "utf8");
const taskPageSource = readFileSync(new URL("../../app/(application)/(system)/tasks/[id]/page.tsx", import.meta.url), "utf8");

test("technician task editing stays unlocked until checkout is recorded", () => {
  assert.match(taskDetailSource, /clockOutAt\?: string \| null/);
  assert.match(taskDetailSource, /const isCheckedOut = !!task\.clockOutAt/);
  assert.match(taskDetailSource, /const isDone = isCheckedOut/);
  assert.doesNotMatch(taskDetailSource, /const isDone = task\.status === "DONE" \|\| !!task\.report/);
  assert.doesNotMatch(taskDetailSource, /const jobDone = task\?\.status === "DONE" \|\| !!task\?\.report/);
});

test("submitted reports lock the signature step until checkout", () => {
  // Once a report exists the submit/update button is hidden and signatures are read-only.
  assert.doesNotMatch(taskDetailSource, /Submit & Update Report/);
  assert.match(taskDetailSource, /const reportSubmitted = task\.status === "DONE" \|\| !!task\.report/);
  assert.match(taskDetailSource, /\{!reportSubmitted && \(/);
  assert.match(taskDetailSource, /await saveAssetRemarks\(\);[\s\S]*action: "report",[\s\S]*url: `\/api\/tasks\/\$\{taskId\}\/report`/);
  assert.match(reportRouteSource, /prisma\.report\.upsert/);
  assert.doesNotMatch(reportRouteSource, /prisma\.report\.create/);
});

test("evidence photo requirement is always at least three and enforced before payment or report", () => {
  assert.match(taskPageSource, /Math\.max\(3, Number\(process\.env\.MIN_EVIDENCE_PHOTOS \?\? 3\)\)/);
  assert.match(taskDetailSource, /const requiredPhotoSlots = Math\.max\(requiredEvidencePhotos, assetPhotos\.length\)/);
  assert.match(taskDetailSource, /assetPhotos\.length >= requiredEvidencePhotos && assetControlsVisible/);
  for (const source of [paymentRouteSource, reportRouteSource]) {
    assert.match(source, /const minEvidencePhotos = Math\.max\(3, Number\(process\.env\.MIN_EVIDENCE_PHOTOS \?\? 3\)\)/);
    assert.match(source, /validateTaskEvidenceReady\(appt, minEvidencePhotos\)/);
    assert.match(source, /return NextResponse\.json\(\{ error: evidenceError \}, \{ status: 422 \}\)/);
  }
});
