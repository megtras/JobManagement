import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateServiceReportPdf } from "@/lib/pdf/regenerate-service-report";
import { randomUUID } from "crypto";
import { uploadPublicUrl } from "@/lib/upload-urls";
import { deleteUploadByUrl, putUpload } from "@/lib/storage";

const REPORT_EDITOR_ROLES = new Set(["ADMIN", "MANAGER", "SUPERVISOR"]);

interface ReportEditBody {
  technicianName?: unknown;
  clientName?: unknown;
  reportDate?: unknown;
  assets?: unknown;
  photos?: unknown;
}

function requiredText(value: unknown, field: string, maxLength = 120) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${field} is too long.`);
  return text;
}

function optionalText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${field} is too long.`);
  return text;
}

function parseReportDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Report date is invalid.");
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Report date is invalid.");
  }
  return date;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REPORT_EDITOR_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { role, branchId } = session.user;
  const appt = await prisma.appointment.findFirst({
    where: {
      id,
      ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}),
    },
    select: {
      id: true,
      status: true,
      report: { select: { pdfUrl: true } },
      assets: { select: { id: true } },
      servicePhotos: { select: { id: true, type: true } },
    },
  });

  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appt.status !== "DONE" || !appt.report) {
    return NextResponse.json({ error: "Only completed reports can be edited." }, { status: 409 });
  }

  let body: ReportEditBody;
  let form: FormData | null = null;
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      form = await req.formData();
      body = JSON.parse(String(form.get("report"))) as ReportEditBody;
    } else {
      body = await req.json() as ReportEditBody;
    }
    if (!body || typeof body !== "object") throw new Error("Invalid report");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Objects already pushed to R2. If the edit fails before the rows are
  // written we delete them again, so a rejected edit leaves no orphans.
  const uploadedUrls: string[] = [];
  let committed = false;
  try {
    const technicianName = requiredText(body.technicianName, "Technician name");
    const clientName = requiredText(body.clientName, "Client name");
    const reportDate = parseReportDate(body.reportDate);
    const rawAssets = Array.isArray(body.assets) ? body.assets : [];
    const rawPhotos = Array.isArray(body.photos) ? body.photos : [];

    if (rawAssets.length > 200 || rawPhotos.length > 500) {
      throw new Error("Too many report items.");
    }

    const allowedAssetIds = new Set(appt.assets.map((asset) => asset.id));
    const allowedPhotoIds = new Set(
      appt.servicePhotos.filter((photo) => photo.type === "EVIDENCE").map((photo) => photo.id),
    );
    const seenAssetIds = new Set<string>();
    const seenPhotoIds = new Set<string>();

    const assets = rawAssets.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Invalid asset report item.");
      const value = item as { id?: unknown; technicianRemark?: unknown };
      const assetId = requiredText(value.id, "Asset id", 100);
      if (!allowedAssetIds.has(assetId) || seenAssetIds.has(assetId)) {
        throw new Error("Invalid asset report item.");
      }
      seenAssetIds.add(assetId);
      return {
        id: assetId,
        technicianRemark: optionalText(value.technicianRemark ?? "", "Technician remark", 4000),
      };
    });

    const photos = rawPhotos.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Invalid report photo.");
      const value = item as { id?: unknown; label?: unknown };
      const photoId = requiredText(value.id, "Photo id", 100);
      if (!allowedPhotoIds.has(photoId) || seenPhotoIds.has(photoId)) {
        throw new Error("Invalid report photo.");
      }
      seenPhotoIds.add(photoId);
      return {
        id: photoId,
        label: optionalText(value.label ?? "", "Photo name", 160),
      };
    });

    // Replacement images arrive as multipart entries keyed "photo:<photoId>".
    // Upstream resized these with sharp; sharp cannot run on Workers, so the
    // bytes are stored as sent and the browser does the downscaling before
    // upload (see AppointmentDetailClient).
    const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
    const replacementUrls = new Map<string, string>();
    for (const [key, file] of form?.entries() ?? []) {
      if (key === "report") continue;
      const photoId = key.startsWith("photo:") ? key.slice(6) : "";
      if (!seenPhotoIds.has(photoId) || replacementUrls.has(photoId)) throw new Error("Invalid replacement photo.");
      if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) {
        throw new Error("Each photo must be an image up to 10 MB.");
      }
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error("Please upload a valid JPG, PNG or WebP image.");
      }
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const filename = `report-evidence-${randomUUID()}.${extension}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await putUpload("photos", filename, buffer, file.type);
      const url = uploadPublicUrl("photos", filename);
      uploadedUrls.push(url);
      replacementUrls.set(photoId, url);
    }

    // D1 has no interactive transactions, so these run in sequence. Order
    // matters: the report row first, then assets, then photos, so a failure
    // part-way leaves the report readable rather than half-relabelled.
    await prisma.report.update({
      where: { appointmentId: id },
      data: { technicianName, clientName, reportDate },
    });
    for (const asset of assets) {
      await prisma.appointmentAsset.update({
        where: { id: asset.id },
        data: { technicianRemark: asset.technicianRemark || null },
      });
    }
    for (const photo of photos) {
      await prisma.servicePhoto.update({
        where: { id: photo.id },
        data: { label: photo.label, ...(replacementUrls.has(photo.id) ? { photoUrl: replacementUrls.get(photo.id) } : {}) },
      });
    }
    committed = true;

    let pdfUrl = appt.report.pdfUrl;
    let warning: string | undefined;
    try {
      pdfUrl = await regenerateServiceReportPdf(id);
    } catch (error) {
      console.error("Could not regenerate edited service report:", error);
      warning = "Report was saved, but the PDF could not be refreshed. Please try again.";
    }

    return NextResponse.json({
      ok: true,
      report: { technicianName, clientName, reportDate: reportDate.toISOString(), pdfUrl },
      warning,
    });
  } catch (error) {
    if (!committed) await Promise.all(uploadedUrls.map((url) => deleteUploadByUrl(url).catch(() => undefined)));
    const message = error instanceof Error ? error.message : "Could not update report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
