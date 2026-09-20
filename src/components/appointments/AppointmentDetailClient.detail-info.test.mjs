import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const detailSource = readFileSync(new URL("./AppointmentDetailClient.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../../app/api/appointments/[id]/route.ts", import.meta.url), "utf8");
const reportRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/report/route.ts", import.meta.url), "utf8");
const regenerateReportSource = readFileSync(new URL("../../lib/pdf/regenerate-service-report.ts", import.meta.url), "utf8");

test("appointment detail receives full customer and per-asset location metadata", () => {
  assert.match(apiSource, /customer: true/);
  assert.match(apiSource, /assets: \{ include: \{ jobCategory/);
  assert.match(apiSource, /teams: \{ select:/);
  assert.match(apiSource, /technicianRemark: a\.technicianRemark \?\? null/);

  assert.match(detailSource, /phone2\?: string \| null/);
  assert.match(detailSource, /email\?: string \| null/);
  assert.match(detailSource, /workLocationAddress\?: string \| null/);
  assert.match(detailSource, /workLocationLat\?: number \| null/);
  assert.match(detailSource, /workLocationLng\?: number \| null/);
  assert.match(detailSource, /technicianRemark\?: string \| null/);
  assert.match(detailSource, /customer: \{ name: string; phone: string; phone2\?: string \| null; email\?: string \| null; area: string; propertyType\?: string \| null \};/);
});

test("appointment detail displays customer details and grouped work locations", () => {
  assert.match(detailSource, /Customer Details/);
  assert.match(detailSource, /Phone Number 2 \(Emergency\)/);
  assert.match(detailSource, /Email/);
  assert.match(detailSource, /District/);

  assert.match(detailSource, /function buildAppointmentWorkLocations/);
  assert.match(detailSource, /propertyGroups: PropertyAssetGroup\[\]/);
  assert.match(detailSource, /asset\.workLocationAddress/);
  assert.match(detailSource, /asset\.additionalAddress/);
  assert.match(detailSource, /const fallbackPropertyType = cleanText\(appt\.customer\.propertyType\) \|\| "Property";/);
  assert.match(detailSource, /const propertyType = cleanText\(asset\.propertyType\) \|\| fallbackPropertyType;/);
  assert.match(detailSource, /Work Locations/);
  assert.match(detailSource, /location\.propertyGroups\.map/);
  assert.match(detailSource, /Property Type/);
  assert.match(detailSource, /Assets \/ Units/);
  assert.match(detailSource, /Technician Remark/);
  assert.match(detailSource, /asset\.technicianRemark/);
  assert.doesNotMatch(detailSource, /appt\.assets\.map\(\(a, i\)/);
});

test("appointment detail fetch bypasses stale browser cache", () => {
  assert.match(detailSource, /fetch\(`\/api\/appointments\/\$\{appointmentId\}`, \{ cache: "no-store" \}\)/);
});

test("appointment detail and reports show orphaned work progress photos after asset-preserving edits", () => {
  assert.match(detailSource, /const orphanEvidencePhotos = evidencePhotos\.filter\(\(p\) => !p\.assetId\)/);
  assert.match(detailSource, /const firstAssetId = workLocations\[0\]\?\.propertyGroups\[0\]\?\.assets\[0\]\?\.id \?\? null/);
  assert.match(detailSource, /const visibleEvidence = assetEvidence\.length > 0[\s\S]*: asset\.id === firstAssetId \? orphanEvidencePhotos : \[\]/);
  assert.match(detailSource, /visibleEvidence\.map\(\(p, photoIndex\)/);

  // Initial task report submit still folds orphan evidence into the first asset.
  assert.match(reportRouteSource, /const orphanEvidence: \{ src: string; label: string \}\[\] = \[\]/);
  assert.match(reportRouteSource, /if \(!photo\.assetId\) \{\s*orphanEvidence\.push\(\{ src: dataUrl, label: photo\.label \|\| "" \}\);\s*continue;\s*\}/);
  assert.match(reportRouteSource, /const firstAssetId = appt\.assets\[0\]\?\.id \?\? null/);
  assert.match(reportRouteSource, /photos: evidenceByAsset\.get\([^)]*\.id\) \?\? \([^)]*\.id === firstAssetId \? orphanEvidence : \[\]\)/);

  // After asset-preserving edits, the regenerated report surfaces orphan evidence
  // in a dedicated General Report Photos section instead of the first asset.
  assert.match(regenerateReportSource, /const orphanEvidence: \{ src: string; label: string \}\[\] = \[\]/);
  assert.match(regenerateReportSource, /if \(!photo\.assetId\) \{\s*orphanEvidence\.push\(\{ src: dataUrl, label: photo\.label \|\| "" \}\);\s*continue;\s*\}/);
  assert.match(regenerateReportSource, /photos: evidenceByAsset\.get\(asset\.id\) \?\? \[\]/);
  assert.match(regenerateReportSource, /generalPhotos: orphanEvidence/);
});

test("appointment detail keeps desktop pdf download and adds a closable in-app viewer for mobile pwa", () => {
  assert.match(detailSource, /const \[pdfViewer, setPdfViewer\] = useState<string \| null>\(null\)/);
  assert.match(detailSource, /const \[pdfDownloadPending, setPdfDownloadPending\] = useState\(false\)/);
  assert.match(detailSource, /const \[pdfOpenPending, setPdfOpenPending\] = useState\(false\)/);
  assert.match(detailSource, /const \[useInAppPdfViewer, setUseInAppPdfViewer\] = useState\(false\)/);
  assert.match(detailSource, /const \[compactPdfViewer, setCompactPdfViewer\] = useState\(false\)/);
  assert.match(detailSource, /window\.matchMedia\("\(display-mode: standalone\)"\)\.matches/);
  assert.match(detailSource, /window\.innerWidth < 768/);
  assert.match(detailSource, /fetch\(`\/api\/appointments\/\$\{appointmentId\}\/report\/regenerate`, \{\s*method: "POST",\s*cache: "no-store"/);
  assert.match(detailSource, /function withCacheBuster\(url: string\)/);
  assert.match(detailSource, /window\.open\("about:blank", "_blank"\)/);
  assert.match(detailSource, /popup\.location\.href = viewUrl/);
  assert.match(detailSource, /setPdfViewer\(viewUrl\)/);
  assert.match(detailSource, /onClick=\{\(\) => handleOpenReportPdf\(appt\.report!\.pdfUrl!\)\}/);
  assert.match(detailSource, /Download PDF Report/);
  assert.match(detailSource, /title="PDF Report"/);
  assert.match(detailSource, /onClick=\{\(\) => setPdfViewer\(null\)\}/);
  assert.match(detailSource, /async function handlePdfDownload\(\)/);
  assert.match(detailSource, /fetch\(pdfViewer, \{ cache: "no-store" \}\)/);
  assert.match(detailSource, /link\.download = `service-report-\$\{appointmentId\}\.pdf`/);
  assert.match(detailSource, /Preparing PDF/);
  assert.match(detailSource, /style=\{compactPdfViewer \? \{ width: .* transform: .* transformOrigin: "top left" \} : undefined\}/s);
  assert.match(detailSource, /src=\{`\$\{pdfViewer\}#toolbar=0&navpanes=0&zoom=page-width&view=FitH`\}/);
});

test("appointment detail photo viewer keeps a visible close button for phone and pwa overlays", () => {
  assert.match(detailSource, /aria-label="Close image viewer"/);
  assert.match(detailSource, /className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white\/95 text-gray-700 shadow-lg transition hover:bg-white"/);
  assert.match(detailSource, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
});
