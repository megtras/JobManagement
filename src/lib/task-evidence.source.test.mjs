import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const evidenceSource = readFileSync(new URL("./task-evidence.ts", import.meta.url), "utf8");
const paymentRouteSource = readFileSync(new URL("../app/api/tasks/[id]/payment/route.ts", import.meta.url), "utf8");
const reportRouteSource = readFileSync(new URL("../app/api/tasks/[id]/report/route.ts", import.meta.url), "utf8");
const taskRouteSource = readFileSync(new URL("../app/api/tasks/[id]/route.ts", import.meta.url), "utf8");

test("task evidence validation uses each asset job category photo template", () => {
  assert.match(evidenceSource, /type EvidenceAsset = \{ id: string; jobCategory\?: \{ minEvidencePhotos\?: number \| null \} \| null \}/);
  assert.match(evidenceSource, /export function evidenceRequirementForAsset/);
  assert.match(evidenceSource, /Math\.max\(3, Number\(asset\.jobCategory\?\.minEvidencePhotos \?\? fallbackEvidencePhotos\)\)/);
  assert.match(evidenceSource, /evidencePhotos\.filter\(\(photo\) => photo\.assetId === asset\.id\)\.length < evidenceRequirementForAsset\(asset, fallbackEvidencePhotos\)/);
  assert.match(paymentRouteSource, /assets: \{ select: \{ id: true, jobCategory: \{ select: \{ minEvidencePhotos: true \} \} \} \}/);
  assert.match(reportRouteSource, /assets: \{ include: \{ jobCategory: \{ select: \{ name: true, minEvidencePhotos: true \} \} \} \}/);
  assert.match(taskRouteSource, /assets: \{ include: \{ jobCategory: \{ select: \{ id: true, name: true, price: true, minEvidencePhotos: true \} \} \} \}/);
});
