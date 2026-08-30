import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { ReportDocument } from "@/lib/pdf/ReportDocument";
import { sendReportEmail } from "@/lib/email/mailer";
import { uploadPublicUrl } from "@/lib/upload-urls";
import { technicianTeamAccessWhere } from "@/lib/task-access";
import { validateTaskEvidenceReady } from "@/lib/task-evidence";
import { whatsappReportLink } from "@/lib/public-url";
import { capturedDate } from "@/lib/offline/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TECHNICIAN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appt = await prisma.appointment.findFirst({
    where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
    include: {
      customer: true, jobCategory: true,
      assets: { include: { jobCategory: { select: { name: true, minEvidencePhotos: true } } } },
      branch: true,
      report: true,
      teams: { select: { name: true, members: { select: { name: true } } } },
      servicePhotos: { where: { type: "EVIDENCE" }, select: { id: true, photoUrl: true, type: true, assetId: true, label: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appt.clockOutAt) {
    return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
  }
  const minEvidencePhotos = Math.max(3, Number(process.env.MIN_EVIDENCE_PHOTOS ?? 3));
  const evidenceError = validateTaskEvidenceReady(appt, minEvidencePhotos);
  if (evidenceError) {
    return NextResponse.json({ error: evidenceError }, { status: 422 });
  }

  const jobCategoryName = appt.jobCategory?.name ?? "Service";

  const {
    technicianName: signedBy,
    technicianSignature,
    clientSignature,
    submittedAt,
  } = await req.json();
  if (!technicianSignature || !clientSignature) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // The signer is the attending team (team-device account). Accept the team
  // name(s) or a registered member name; otherwise fall back to the account name.
  const teamMemberNames = appt.teams.flatMap((t) => t.members.map((m) => m.name));
  const teamNames = appt.teams.map((t) => t.name);
  const allowedSigners = [...teamMemberNames, ...teamNames];
  const technicianName = (typeof signedBy === "string" && allowedSigners.includes(signedBy))
    ? signedBy
    : (session.user.name ?? "Technician");

  // Client name is the customer recorded on the appointment (shown read-only on the device).
  const clientName = appt.customer.name || appt.customer.phone || "Customer";
  const reportTimestamp = capturedDate(submittedAt);

  // A queued request may have reached the server even when its response never
  // reached the device. Return the existing result instead of generating a
  // second PDF, email and notification when the same signed report is retried.
  if (
    appt.report?.pdfUrl
    && appt.report.technicianSignature === technicianSignature
    && appt.report.clientSignature === clientSignature
  ) {
    const pdfUrl = appt.report.pdfUrl;
    return NextResponse.json({
      ok: true,
      alreadySubmitted: true,
      pdfUrl,
      whatsappLink: whatsappReportLink(appt.customer.phone, pdfUrl, req),
    });
  }

  // Inline each asset's evidence photos as data URLs so they embed in the PDF.
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
    const list = evidenceByAsset.get(photo.assetId) ?? [];
    list.push({ src: dataUrl, label: photo.label || "" });
    evidenceByAsset.set(photo.assetId, list);
  }
  const firstAssetId = appt.assets[0]?.id ?? null;
  const assetsWithPhotos = appt.assets.map((a) => ({
    ...a,
    jobCategoryName: a.jobCategory?.name ?? null,
    unitPrice: Number(a.unitPrice),
    billingType: a.billingType ?? null,
    remarks: a.remarks ?? null,
    technicianRemark: a.technicianRemark ?? null,
    photos: evidenceByAsset.get(a.id) ?? (a.id === firstAssetId ? orphanEvidence : []),
  }));

  const reportDate = reportTimestamp.toLocaleDateString("en-MY", {
    day: "2-digit", month: "long", year: "numeric",
  });

  // Generate PDF
  let pdfUrl = "";
  try {
    const pdfBuffer = await renderToBuffer(
      // @react-pdf/renderer v4 types expect DocumentProps on the root element;
      // casting through unknown avoids the mismatch without weakening Props itself.
      createElement(ReportDocument, {
        reportDate,
        technicianName,
        technicianSignature,
        clientName,
        clientSignature,
        jobCategory: jobCategoryName,
        locationAddress: appt.locationAddress,
        appointmentDate: new Date(appt.date).toLocaleDateString("en-MY"),
        appointmentTime: appt.time,
        assets: assetsWithPhotos,
        billingType: appt.billingType,
        warrantyNote: appt.warrantyNote,
        totalPrice: parseFloat(appt.totalPrice.toString()),
      }) as unknown as Parameters<typeof renderToBuffer>[0]
    );

    const reportsDir = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", "reports");
    await mkdir(reportsDir, { recursive: true });
    const pdfFilename = `report-${id}-${Date.now()}.pdf`;
    await writeFile(path.join(reportsDir, pdfFilename), pdfBuffer);
    pdfUrl = uploadPublicUrl("reports", pdfFilename);
  } catch (err) {
    console.error("PDF generation failed:", err);
  }

  // Save or refresh the report while the task remains editable before checkout.
  await prisma.report.upsert({
    where: { appointmentId: id },
    update: {
      technicianName,
      technicianSignature,
      clientName,
      clientSignature,
      reportDate: reportTimestamp,
      pdfUrl,
      status: "DONE",
    },
    create: {
      appointmentId: id,
      technicianName,
      technicianSignature,
      clientName,
      clientSignature,
      reportDate: reportTimestamp,
      pdfUrl,
      status: "DONE",
    },
  });

  // Mark appointment as DONE
  await prisma.appointment.update({
    where: { id },
    data: { status: "DONE" },
  });

  // WhatsApp share link for PDF
  const whatsappLink = whatsappReportLink(appt.customer.phone, pdfUrl, req);

  // Email PDF to customer
  if (appt.customer.email) {
    try {
      const absolutePdfPath = pdfUrl
        ? path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", "reports", path.basename(pdfUrl))
        : "";
      await sendReportEmail({
        to: appt.customer.email,
        customerName: appt.customer.name,
        appointmentDate: new Date(appt.date).toLocaleDateString("en-MY"),
        jobCategory: jobCategoryName,
        technicianName,
        pdfPath: absolutePdfPath,
        whatsappLink,
      });
    } catch (err) {
      console.error("Email send failed:", err);
    }
  }

  // Notify admins
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", branchId: appt.branchId },
  });
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: "REPORT_SUBMITTED",
        message: Number(appt.totalPrice) <= 0
          ? `FOC job completed for ${appt.customer.name}. No payment is required.`
          : `Job completed for ${appt.customer.name}. Please send payment receipt to client.`,
        relatedAppointmentId: id,
      })),
    });
  }

  return NextResponse.json({ ok: true, pdfUrl, whatsappLink });
}
