import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("./regenerate-service-report.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

for (const hasAssets of [true, false]) {
  test(`general evidence reaches the PDF ${hasAssets ? "alongside asset photos" : "after all assets are removed"}`, async () => {
    let rendered, saved;
    const appt = {
      report: { reportDate: "2026-09-20", technicianName: "Tech", clientName: "Client", technicianSignature: "tech-sign", clientSignature: "client-sign" },
      date: "2026-09-20", time: "09:00", totalPrice: hasAssets ? 100 : 0, billingType: "CHARGEABLE",
      assets: hasAssets ? [{ id: "asset1", label: "Unit", unitPrice: 100 }] : [],
      servicePhotos: [
        ...(hasAssets ? [{ id: "asset-photo", assetId: "asset1", label: "Asset photo", photoUrl: "/uploads/photos/unit.jpg" }] : []),
        { id: "general-photo", assetId: null, label: "General evidence", photoUrl: "/uploads/photos/general.jpg" },
      ],
    };
    const mocks = {
      react: { createElement: (_component, props) => props },
      "@react-pdf/renderer": { renderToBuffer: async (props) => { rendered = props; return Buffer.from("PDF"); } },
      // This app stores uploads in R2, so the generator reads and writes
      // through the storage helper rather than the filesystem.
      "@/lib/storage": {
        uploadBytesByUrl: async () => new Uint8Array([1, 2, 3]),
        putUpload: async () => {},
      },
      path,
      "@/lib/prisma": { prisma: { appointment: { findUnique: async () => appt }, report: { update: async ({ data }) => { saved = data; } } } },
      "@/lib/upload-urls": { uploadPublicUrl: (dir, file) => `/uploads/${dir}/${file}` },
      "@/lib/pdf/ReportDocument": { ReportDocument: () => null },
    };
    const exports = {};
    vm.runInNewContext(source, { exports, require: (name) => mocks[name], Buffer, process });
    await exports.regenerateServiceReportPdf("job");
    assert.equal(rendered.generalPhotos.length, 1);
    assert.equal(rendered.generalPhotos[0].label, "General evidence");
    assert.equal(rendered.assets.length, hasAssets ? 1 : 0);
    if (hasAssets) assert.equal(rendered.assets[0].photos[0].label, "Asset photo");
    assert.equal(rendered.clientSignature, "client-sign");
    assert.match(saved.pdfUrl, /^\/uploads\/reports\/report-job-/);
  });
}
