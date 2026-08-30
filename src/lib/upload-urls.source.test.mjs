import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const uploadUrlHelper = new URL("./upload-urls.ts", import.meta.url);
const uploadRoute = new URL("../app/api/uploads/[...path]/route.ts", import.meta.url);
const taskDetail = new URL("../components/tasks/TaskDetailClient.tsx", import.meta.url);
const photoRoute = new URL("../app/api/tasks/[id]/photo/route.ts", import.meta.url);
const reportRoute = new URL("../app/api/tasks/[id]/report/route.ts", import.meta.url);
const swSource = new URL("../sw.ts", import.meta.url);
const nextConfig = new URL("../../next.config.ts", import.meta.url);
const notFoundPage = new URL("../app/not-found.tsx", import.meta.url);

test("runtime upload files are served through an API route instead of static public uploads", () => {
  assert.equal(existsSync(uploadUrlHelper), true);
  assert.equal(existsSync(uploadRoute), true);

  const helperSource = readFileSync(uploadUrlHelper, "utf8");
  const routeSource = readFileSync(uploadRoute, "utf8");
  const photoSource = readFileSync(photoRoute, "utf8");
  const reportSource = readFileSync(reportRoute, "utf8");

  assert.match(helperSource, /export function uploadPublicUrl/);
  assert.match(helperSource, /export function normalizeUploadUrl/);
  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /Content-Disposition/);
  assert.match(photoSource, /uploadPublicUrl\("photos", filename\)/);
  assert.match(reportSource, /uploadPublicUrl\("reports", pdfFilename\)/);
});

test("task photo previews and pdf links normalize legacy uploads before rendering", () => {
  const source = readFileSync(taskDetail, "utf8");

  assert.match(source, /import \{ normalizeUploadUrl \} from "@\/lib\/upload-urls"/);
  assert.match(source, /function PhotoThumbnail/);
  assert.match(source, /src=\{normalizeUploadUrl\(photo\.photoUrl\)\}/);
  assert.match(source, /<PhotoThumbnail/);
  assert.match(source, /const abs = normalizeUploadUrl\(url\)/);
  assert.doesNotMatch(source, /window\.location\.href = abs/);
});

test("service worker and headers avoid caching runtime uploads as immutable app assets", () => {
  const sw = readFileSync(swSource, "utf8");
  const config = readFileSync(nextConfig, "utf8");

  assert.match(sw, /filterPrecacheUploads/);
  assert.match(sw, /pathname\.startsWith\("\/api\/uploads\/"\)/);
  assert.match(config, /source: "\/api\/uploads\/:path\*"/);
  assert.match(config, /no-store/);
});

test("not found page gives installed app users a way back into the app", () => {
  assert.equal(existsSync(notFoundPage), true);
  const source = readFileSync(notFoundPage, "utf8");

  assert.match(source, /href="\/tasks"/);
  assert.match(source, /href="\/dashboard"/);
});
