import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { uploadPublicUrl } from "@/lib/upload-urls";
import { ReportDocument } from "@/lib/pdf/ReportDocument";

export async function regenerateServiceReportPdf(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      customer: true,
      jobCategory: true,
      report: true,
      assets: { include: { jobCategory: { select: { name: true } } } },
      servicePhotos: {
        where: { type: "EVIDENCE" },
        select: { id: true, photoUrl: true, type: true, assetId: true, label: true },
      },
    },
  });

  if (!appt) throw new Error("Appointment not found");
  if (!appt.report) throw new Error("Report not found");

  const photosDir = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", "photos");
  async function loadPhotoDataUrl(photoUrl: string): Promise<string | null> {
    try {
      const buf = await readFile(path.join(photosDir, path.basename(photoUrl)));
      const ext = path.extname(photoUrl).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }

  const evidenceByAsset = new Map<string, { src: string; label: string }[]>();
  const orphanEvidence: { src: string; label: string }[] = [];
  for (const photo of appt.servicePhotos) {
    const dataUrl = await loadPhotoDataUrl(photo.photoUrl);
    if (!dataUrl) continue;
    if (!photo.assetId) {
      orphanEvidence.push({ src: dataUrl, label: photo.label || "" });
      continue;
    }
    const photos = evidenceByAsset.get(photo.assetId) ?? [];
    photos.push({ src: dataUrl, label: photo.label || "" });
    evidenceByAsset.set(photo.assetId, photos);
  }

  const firstAssetId = appt.assets[0]?.id ?? null;
  const assetsWithPhotos = appt.assets.map((asset) => ({
    ...asset,
    jobCategoryName: asset.jobCategory?.name ?? null,
    unitPrice: Number(asset.unitPrice),
    billingType: asset.billingType ?? null,
    remarks: asset.remarks ?? null,
    technicianRemark: asset.technicianRemark ?? null,
    photos: evidenceByAsset.get(asset.id) ?? (asset.id === firstAssetId ? orphanEvidence : []),
  }));

  const reportDate = new Date(appt.report.reportDate).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const pdfBuffer = await renderToBuffer(
    createElement(ReportDocument, {
      reportDate,
      technicianName: appt.report.technicianName,
      technicianSignature: appt.report.technicianSignature,
      clientName: appt.report.clientName,
      clientSignature: appt.report.clientSignature,
      jobCategory: appt.jobCategory?.name ?? "Service",
      locationAddress: appt.locationAddress,
      appointmentDate: new Date(appt.date).toLocaleDateString("en-MY"),
      appointmentTime: appt.time,
      assets: assetsWithPhotos,
      billingType: appt.billingType,
      warrantyNote: appt.warrantyNote,
      totalPrice: parseFloat(appt.totalPrice.toString()),
    }) as unknown as Parameters<typeof renderToBuffer>[0],
  );

  const reportsDir = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", "reports");
  await mkdir(reportsDir, { recursive: true });
  const pdfFilename = `report-${appointmentId}-${Date.now()}.pdf`;
  await writeFile(path.join(reportsDir, pdfFilename), pdfBuffer);
  const pdfUrl = uploadPublicUrl("reports", pdfFilename);

  await prisma.report.update({
    where: { appointmentId },
    data: { pdfUrl },
  });

  return pdfUrl;
}
