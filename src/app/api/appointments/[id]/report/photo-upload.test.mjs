import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { randomUUID } from "node:crypto";

const source = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

// Upstream wrote resized files to disk inside a transaction. On Workers the
// bytes go to R2 and D1 has no interactive transactions, so the mocks here are
// the storage helper and the plain prisma client.
function setup(role = "ADMIN", failSave = false) {
  const updates = [], writes = [], removed = [];
  let regenerated = false;
  const mocks = {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "next-auth": { getServerSession: async () => ({ user: { role, branchId: "branch" } }) },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma: {
      appointment: { findFirst: async ({ where }) => {
        assert.equal(where.branchId, role === "SUPERVISOR" ? undefined : "branch");
        return { id: "job", status: "DONE", report: { pdfUrl: "old.pdf" }, assets: [], servicePhotos: [{ id: "photo1", type: "EVIDENCE" }] };
      } },
      report: { update: async () => { if (failSave) throw new Error("Save failed"); } },
      appointmentAsset: { update: async () => {} },
      servicePhoto: { update: async (value) => updates.push(value) },
    } },
    "@/lib/pdf/regenerate-service-report": { regenerateServiceReportPdf: async () => {
      assert.equal(updates.length, 1); regenerated = true; return "new.pdf";
    } },
    "@/lib/upload-urls": { uploadPublicUrl: (dir, name) => `/uploads/${dir}/${name}` },
    "@/lib/storage": {
      putUpload: async (_section, name) => { writes.push(name); },
      deleteUploadByUrl: async (url) => { removed.push(url); },
    },
    crypto: { randomUUID },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => mocks[name], Response, File, FormData, Buffer, process, console });
  return { patch: exports.PATCH, updates, writes, removed, regenerated: () => regenerated };
}

async function request(photoId = "photo1", contentType = "image/png") {
  const form = new FormData();
  form.set("report", JSON.stringify({ technicianName: "Tech", clientName: "Client", reportDate: "2026-09-11", photos: [{ id: "photo1", label: "After repair" }] }));
  form.set(`photo:${photoId}`, new File([Buffer.from("image-bytes")], "photo.png", { type: contentType }));
  return new Request("http://localhost/api/appointments/job/report", { method: "PATCH", body: form });
}
const context = { params: Promise.resolve({ id: "job" }) };

for (const role of ["ADMIN", "MANAGER", "SUPERVISOR"]) {
  test(`${role} can replace report evidence and regenerate PDF`, async () => {
    const app = setup(role);
    const response = await app.patch(await request(), context);
    assert.equal(response.status, 200);
    assert.equal(app.updates[0].where.id, "photo1");
    assert.match(app.updates[0].data.photoUrl, /\.png$/);
    assert.equal(app.writes.length, 1);
    assert.equal(app.regenerated(), true);
  });
}

test("technician cannot replace completed report evidence", async () => {
  const app = setup("TECHNICIAN");
  assert.equal((await app.patch(await request(), context)).status, 403);
  assert.equal(app.writes.length, 0);
});

test("foreign photo id and non-image upload do not change report", async () => {
  // Without sharp the file is vetted by declared type rather than by decoding.
  for (const req of [await request("foreign"), await request("photo1", "text/plain")]) {
    const app = setup();
    assert.equal((await app.patch(req, context)).status, 400);
    assert.equal(app.updates.length, 0);
    assert.equal(app.writes.length, 0);
  }
});

test("failed report save removes newly uploaded objects", async () => {
  const app = setup("ADMIN", true);
  assert.equal((await app.patch(await request(), context)).status, 400);
  assert.equal(app.writes.length, 1);
  assert.equal(app.removed.length, 1);
  assert.match(app.removed[0], /\/uploads\/photos\/report-evidence-.*\.png$/);
  assert.equal(app.regenerated(), false);
});
