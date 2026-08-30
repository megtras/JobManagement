import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const idbSource = read("./idb.ts");
const clientSource = read("./client.ts");
const syncSource = read("./sync.ts");
const swSource = read("../../sw.ts");
const statusSource = read("../../components/pwa/OfflineSyncStatus.tsx");
const tasksSource = read("../../components/tasks/TasksClient.tsx");
const detailSource = read("../../components/tasks/TaskDetailClient.tsx");
const manifest = JSON.parse(read("../../../public/manifest.webmanifest"));

test("technician PWA opens on the cached task workspace", () => {
  // Keep the installed-app identity stable so existing technicians receive the update.
  assert.equal(manifest.id, "/login");
  assert.equal(manifest.start_url, "/app/tasks");
  assert.equal(manifest.scope, "/app/");
  assert.ok(existsSync(new URL("../../../public/app-offline.html", import.meta.url)));
  assert.match(swSource, /url: "\/app-offline\.html"/);
  assert.match(swSource, /request\.mode === "navigate"/);
  assert.match(tasksSource, /type: "CACHE_URLS"/);
  assert.match(tasksSource, /`\/app\/tasks\/\$\{task\.id\}`/);
  assert.match(tasksSource, /cacheTaskList\(data\)/);
  assert.match(tasksSource, /getCachedTaskList<Task\[\]>\(\)/);
  assert.match(tasksSource, /cacheTask\(task\.id, await response\.json\(\)\)/);
});

test("live task and completed appointment detail bypass stale service-worker API responses", () => {
  assert.match(swSource, /import \{ Serwist, NetworkFirst, NetworkOnly \} from "serwist"/);
  assert.ok(swSource.includes('/^\\/api\\/tasks\\/[^/]+$/.test(url.pathname)'));
  assert.ok(swSource.includes('/^\\/api\\/appointments\\/[^/]+$/.test(url.pathname)'));
  assert.match(swSource, /new NetworkOnly\(\)/);
  assert.match(swSource, /method: "GET",\s+handler: new NetworkOnly\(\)/);
  assert.ok(
    swSource.indexOf("handler: new NetworkOnly()") < swSource.indexOf("...defaultCache"),
    "the task-detail rule must run before Serwist's generic API cache",
  );
});

test("offline queue preserves JSON, form fields and captured files in IndexedDB", () => {
  assert.match(idbSource, /const DB_VERSION = 2/);
  assert.match(idbSource, /taskLists:/);
  assert.match(idbSource, /value: string \| Blob/);
  assert.match(clientSource, /serializeFormData\(formData: FormData\)/);
  assert.match(clientSource, /return queueItem\(item\)/);
  assert.match(clientSource, /shouldRetryLater\(response\.status\)/);
  assert.match(syncSource, /form\.append\(entry\.name, entry\.value, entry\.filename\)/);
  assert.match(syncSource, /"X-Offline-Captured-At"/);
});

test("all technician mutations use the ordered offline request pipeline", () => {
  for (const action of [
    "start",
    "checkin",
    "checkin-sos",
    "photo-create",
    "photo-update",
    "photo-delete",
    "remark",
    "work-item",
    "payment",
    "urgent",
    "report",
    "checkout",
  ]) {
    assert.match(detailSource, new RegExp(`action: [^\\n]*"${action}"`));
  }
  assert.match(syncSource, /for \(const item of queue\)/);
  assert.match(syncSource, /blockedTasks\.has\(item\.taskId\)/);
  assert.match(clientSource, /const earlierTaskActions = await getPendingQueueForTask\(item\.taskId\)/);
  assert.match(clientSource, /if \(earlierTaskActions\.length > 0\) \{\s*return queueItem\(item\)/);
  assert.match(clientSource, /sync\?: \{ register\(tag: string\)/);
  assert.match(swSource, /addEventListener\("sync"/);
  assert.match(statusSource, /window\.addEventListener\("online", updateNetwork\)/);
  assert.match(statusSource, /FOREGROUND_SYNC_INTERVAL_MS = 30_000/);
});

test("retryable create routes accept device ids and original event times", () => {
  const checkIn = read("../../app/api/tasks/[id]/checkin/route.ts");
  const photo = read("../../app/api/tasks/[id]/photo/route.ts");
  const payment = read("../../app/api/tasks/[id]/payment/route.ts");
  const workItem = read("../../app/api/tasks/[id]/work-items/route.ts");
  const report = read("../../app/api/tasks/[id]/report/route.ts");

  assert.match(checkIn, /clientGeneratedId\(clientCheckInId, "checkin"\)/);
  assert.match(checkIn, /checkedInAt: capturedDate\(checkedInAt\)/);
  assert.match(photo, /clientGeneratedId\(form\.get\("clientPhotoId"\), "photo"\)/);
  assert.match(photo, /createdAt,/);
  assert.match(payment, /clientGeneratedId\(form\.get\("clientPaymentId"\), "payment"\)/);
  assert.match(payment, /createdAt: submittedAt/);
  assert.match(workItem, /clientGeneratedId\(body\.clientAssetId, "asset"\)/);
  assert.match(report, /alreadySubmitted: true/);
  assert.match(report, /reportDate: reportTimestamp/);
});
