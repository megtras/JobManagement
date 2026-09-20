import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { randomUUID } from "node:crypto";

function compile(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected import ${name}`);
    return mocks[name];
  }, Response, File, FormData, Buffer, process, console });
  return exports;
}
const pricing = compile("../../../../../lib/appointment-pricing.ts");
const context = { params: Promise.resolve({ id: "job" }) };
const base = { technicianName: "Tech", clientName: "Client", reportDate: "2026-09-20" };
const originalAsset = { id: "asset1", label: "Bedroom", acType: "Wall", unitPrice: 100, billingType: "CHARGEABLE", remarks: "Original\nremark", technicianRemark: "Done", workLocationAddress: "Old address", workLocationLat: 3, workLocationLng: 101 };

function setup({ role = "MANAGER", branchId = "branch", status = "DONE", found = true, failSave = false, failPdf = false } = {}) {
  let state = { assets: [structuredClone(originalAsset)], photos: [
    { id: "photo1", type: "EVIDENCE", assetId: "asset1", label: "Before", photoUrl: "old.jpg" },
    { id: "checkin", type: "CHECK_IN", assetId: null, photoUrl: "checkin.jpg" },
  ], totalPrice: 100, report: { pdfUrl: "old.pdf", technicianSignature: "tech-sign", clientSignature: "client-sign" } };
  const writes = [], removed = [];
  let regenerated = false;
  const mocks = {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "next-auth": { getServerSession: async () => role ? { user: { role, branchId } } : null },
    "@/lib/auth": { authOptions: {} },
    "@/lib/appointment-pricing": pricing,
    "@/lib/prisma": { prisma: {
      appointment: {
        findFirst: async ({ where }) => {
          assert.equal(where.branchId, role === "SUPERVISOR" ? undefined : branchId);
          return found ? { id: "job", status, report: state.report, assets: structuredClone(state.assets), servicePhotos: structuredClone(state.photos) } : null;
        },
        update: async ({ data }) => Object.assign(state, data),
      },
      jobCategory: { findMany: async ({ where }) => where.id.in.includes("category1") ? [{ id: "category1", name: "Troubleshoot" }] : [] },
      // No $transaction: on D1 the route writes sequentially, so these mocks
      // mutate state as each call lands. failSave throws on the first write
      // (the report row), which is why nothing downstream is applied.
      report: { update: async ({ data }) => { if (failSave) throw new Error("Save failed"); Object.assign(state.report, data); } },
      appointmentAsset: {
        update: async ({ where, data }) => Object.assign(state.assets.find((asset) => asset.id === where.id), data),
        create: async ({ data }) => { const asset = { id: `created-${state.assets.length}`, ...data }; state.assets.push(asset); return asset; },
        deleteMany: async ({ where }) => { assert.equal(where.appointmentId, "job"); state.assets = state.assets.filter((asset) => !where.id.in.includes(asset.id)); },
        findMany: async () => state.assets,
      },
      servicePhoto: {
        update: async ({ where, data }) => Object.assign(state.photos.find((photo) => photo.id === where.id), data),
        create: async ({ data }) => state.photos.push({ id: "created-photo", ...data }),
        deleteMany: async ({ where }) => { assert.equal(where.type, "EVIDENCE"); assert.equal(where.appointmentId, "job"); state.photos = state.photos.filter((photo) => !where.id.in.includes(photo.id)); },
        updateMany: async ({ where, data }) => state.photos.filter((photo) => where.assetId.in.includes(photo.assetId)).forEach((photo) => Object.assign(photo, data)),
      },
    } },
    "@/lib/pdf/regenerate-service-report": { regenerateServiceReportPdf: async () => { regenerated = true; if (failPdf) throw new Error("PDF unavailable"); return "new.pdf"; } },
    "@/lib/upload-urls": { uploadPublicUrl: (dir, name) => `/uploads/${dir}/${name}` },
    "@/lib/storage": {
      putUpload: async (section, name) => { writes.push(`/uploads/${section}/${name}`); },
      deleteUploadByUrl: async (url) => { removed.push(url); },
    },
    crypto: { randomUUID },
  };
  return { patch: compile("./route.ts", mocks).PATCH, state: () => state, writes, removed, regenerated: () => regenerated };
}

async function request(body, uploadIds = []) {
  const form = new FormData();
  form.set("report", JSON.stringify({ ...base, ...body }));
  for (const id of uploadIds) {
    const bytes = Buffer.from("image-bytes");
    form.set(`photo:${id}`, new File([bytes], "image.png", { type: "image/png" }));
  }
  return new Request("http://localhost/api/appointments/job/report", { method: "PATCH", body: form });
}

for (const role of ["MANAGER", "SUPERVISOR", "ADMIN"]) {
  test(`${role} can add assets/photos, edit both remarks, remove photos and update the total`, async () => {
    const app = setup({ role });
    const response = await app.patch(await request({
      assets: [
        { id: "asset1", remarks: "Updated\nremark", technicianRemark: "Repaired\nand tested", unitPrice: 120 },
        { id: "new:unit", isNew: true, label: "Kitchen", acType: "Wall", jobCategoryId: "category1", unitPrice: 80, technicianRemark: "Cleaned" },
        { id: "new:warranty", isNew: true, label: "Warranty unit", unitPrice: 99, billingType: "WARRANTY" },
      ],
      photos: [{ id: "new:photo", isNew: true, assetId: "new:unit", label: "After cleaning" }],
      deletedPhotoIds: ["photo1"],
    }, ["new:photo"]), context);
    assert.equal(response.status, 200, JSON.stringify(await response.json()));
    const state = app.state();
    assert.equal(state.assets.length, 3);
    assert.equal(state.assets[0].remarks, "Updated\nremark");
    assert.equal(state.assets[0].technicianRemark, "Repaired\nand tested");
    assert.equal(state.assets[1].isTroubleshoot, true);
    assert.equal(state.photos.length, 2);
    assert.equal(state.photos[1].assetId, state.assets[1].id);
    // Uploads keep their source type now that sharp no longer re-encodes to JPEG.
    assert.match(state.photos[1].photoUrl, /\.png$/);
    assert.equal(state.totalPrice, 200);
    assert.equal(state.report.technicianSignature, "tech-sign");
    assert.equal(app.regenerated(), true);
  });
}
test("deleting the last asset retains photos as general evidence and sets total to zero", async () => {
  const app = setup();
  assert.equal((await app.patch(await request({ deletedAssetIds: ["asset1"] }), context)).status, 200);
  assert.equal(app.state().assets.length, 0);
  assert.equal(app.state().photos[0].assetId, null);
  assert.equal(app.state().totalPrice, 0);
});
test("legacy remark-only JSON requests preserve asset fields, price and omitted photos", async () => {
  const app = setup();
  const req = new Request("http://localhost/api/appointments/job/report", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, assets: [{ id: "asset1", technicianRemark: "Corrected" }] }) });
  assert.equal((await app.patch(req, context)).status, 200);
  assert.equal(app.state().assets[0].label, "Bedroom");
  assert.equal(app.state().assets[0].remarks, originalAsset.remarks);
  assert.equal(app.state().assets[0].workLocationLat, 3);
  assert.equal(app.state().totalPrice, 100);
  assert.equal(app.state().photos.length, 2);
});
test("changing a work address clears stale GPS coordinates", async () => {
  const app = setup();
  assert.equal((await app.patch(await request({ assets: [{ id: "asset1", workLocationAddress: "New address" }] }), context)).status, 200);
  assert.equal(app.state().assets[0].workLocationLat, null);
});
test("rejects unauthorized roles, missing branch, other branches and unfinished jobs", async () => {
  for (const [options, expected] of [[{ role: "TECHNICIAN" }, 403], [{ role: null }, 401], [{ branchId: null }, 403], [{ found: false }, 404], [{ status: "IN_PROGRESS" }, 409]]) {
    const app = setup(options);
    assert.equal((await app.patch(await request({ deletedAssetIds: ["asset1"] }), context)).status, expected);
    assert.equal(app.regenerated(), false);
    assert.equal(app.state().assets.length, 1);
  }
});
test("rejects foreign IDs, non-evidence photos, conflicting edits, invalid prices and missing uploads", async () => {
  for (const body of [
    { deletedAssetIds: ["foreign"] }, { deletedPhotoIds: ["foreign"] }, { deletedPhotoIds: ["checkin"] },
    { assets: [{ id: "foreign" }] }, { photos: [{ id: "checkin" }] },
    { assets: [{ id: "asset1" }], deletedAssetIds: ["asset1"] },
    { photos: [{ id: "photo1" }], deletedPhotoIds: ["photo1"] },
    { photos: [{ id: "photo1", assetId: "foreign" }] },
    { photos: [{ id: "new:photo", isNew: true }] },
    { assets: [{ id: "asset1", unitPrice: -1 }] },
    { assets: [{ id: "asset1", unitPrice: "invalid" }] },
    { assets: [{ id: "asset1", unitPrice: 1.001 }] },
    { assets: [{ id: "asset1", jobCategoryId: "foreign" }] },
    { assets: "invalid" }, { deletedPhotoIds: "invalid" },
  ]) {
    const app = setup();
    assert.equal((await app.patch(await request(body), context)).status, 400, JSON.stringify(body));
    assert.equal(app.regenerated(), false);
    assert.equal(app.state().assets.length, 1);
  }
});
test("a failed save leaves data untouched and cleans new uploads", async () => {
  const app = setup({ failSave: true });
  const response = await app.patch(await request({ deletedAssetIds: ["asset1"], photos: [{ id: "new:photo", isNew: true }] }, ["new:photo"]), context);
  assert.equal(response.status, 400);
  assert.equal(app.state().assets.length, 1);
  assert.equal(app.state().photos.length, 2);
  assert.equal(app.regenerated(), false);
  assert.deepEqual(app.removed, app.writes);
  assert.equal(app.writes.length, 1);
});
test("PDF failure retains committed data and uploaded files with a warning", async () => {
  const app = setup({ failPdf: true });
  const response = await app.patch(await request({ photos: [{ id: "new:photo", isNew: true }] }, ["new:photo"]), context);
  assert.equal(response.status, 200);
  assert.match((await response.json()).warning, /PDF could not be refreshed/);
  assert.equal(app.state().photos.length, 3);
  assert.equal(app.removed.length, 0);
});
