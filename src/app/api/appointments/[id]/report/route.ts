import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { regenerateServiceReportPdf } from "@/lib/pdf/regenerate-service-report";
import { randomUUID } from "crypto";
import { uploadPublicUrl } from "@/lib/upload-urls";
import { deleteUploadByUrl, putUpload } from "@/lib/storage";
import { calculateChargeableAssetTotal, isTroubleshootCategoryName } from "@/lib/appointment-pricing";

const REPORT_EDITOR_ROLES = new Set(["ADMIN", "MANAGER", "SUPERVISOR"]);

interface ReportEditBody {
  technicianName?: unknown;
  clientName?: unknown;
  reportDate?: unknown;
  assets?: unknown;
  photos?: unknown;
  deletedAssetIds?: unknown;
  deletedPhotoIds?: unknown;
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
  if (role !== "SUPERVISOR" && !branchId) return NextResponse.json({ error: "Branch access required." }, { status: 403 });
  const appt = await prisma.appointment.findFirst({
    where: {
      id,
      ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}),
    },
    select: {
      id: true,
      status: true,
      report: { select: { pdfUrl: true } },
      assets: true,
      servicePhotos: { select: { id: true, type: true, assetId: true } },
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
    if ((body.assets !== undefined && !Array.isArray(body.assets)) || (body.photos !== undefined && !Array.isArray(body.photos))) throw new Error("Invalid report items.");
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
    function deletedIds(value: unknown, allowed: Set<string>) {
      if (value === undefined) return [];
      if (!Array.isArray(value) || value.length > 500) throw new Error("Invalid deleted items.");
      const ids = value.map((id) => requiredText(id, "Deleted item id", 100));
      if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id))) throw new Error("Invalid deleted items.");
      return ids;
    }
    const deletedAssetIds = deletedIds(body.deletedAssetIds, allowedAssetIds);
    const deletedPhotoIds = deletedIds(body.deletedPhotoIds, allowedPhotoIds);

    const assets = rawAssets.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Invalid asset report item.");
      const value = item as Record<string, unknown>;
      const assetId = requiredText(value.id, "Asset id", 100);
      const isNew = value.isNew === true;
      if ((isNew ? !assetId.startsWith("new:") : !allowedAssetIds.has(assetId)) || seenAssetIds.has(assetId) || deletedAssetIds.includes(assetId)) {
        throw new Error("Invalid asset report item.");
      }
      seenAssetIds.add(assetId);
      const original = appt.assets.find((asset) => asset.id === assetId);
      const text = (key: string, fallback: string | null | undefined, max = 4000) =>
        optionalText(value[key] === undefined ? fallback ?? "" : value[key], key, max);
      if (value.unitPrice !== undefined && (typeof value.unitPrice !== "number" && typeof value.unitPrice !== "string" || typeof value.unitPrice === "string" && !value.unitPrice.trim())) throw new Error("Invalid asset price.");
      const price = value.unitPrice === undefined ? Number(original?.unitPrice ?? 0) : Number(value.unitPrice);
      if (!Number.isFinite(price) || price < 0 || price > 99999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001) throw new Error("Invalid asset price.");
      const billingType = value.billingType ?? original?.billingType ?? "CHARGEABLE";
      if (billingType !== "CHARGEABLE" && billingType !== "WARRANTY") throw new Error("Invalid asset billing type.");
      return {
        id: assetId,
        isNew,
        label: text("label", original?.label, 200),
        acType: text("acType", original?.acType, 120),
        jobCategoryId: text("jobCategoryId", original?.jobCategoryId, 100) || null,
        unitPrice: price,
        billingType,
        remarks: text("remarks", original?.remarks),
        additionalAddress: text("additionalAddress", original?.additionalAddress),
        propertyType: text("propertyType", original?.propertyType, 120),
        workLocationAddress: text("workLocationAddress", original?.workLocationAddress),
        technicianRemark: text("technicianRemark", original?.technicianRemark),
      };
    });
    if (appt.assets.length - deletedAssetIds.length + assets.filter((asset) => asset.isNew).length > 200) throw new Error("Too many assets.");
    const categoryIds = [...new Set(assets.map((asset) => asset.jobCategoryId).filter((id): id is string => !!id))];
    const categories = categoryIds.length ? await prisma.jobCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }) : [];
    if (categories.length !== categoryIds.length) throw new Error("Invalid job category.");
    const finalAssetIds = new Set([...allowedAssetIds, ...assets.map((asset) => asset.id)].filter((id) => !deletedAssetIds.includes(id)));

    const photos = rawPhotos.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Invalid report photo.");
      const value = item as { id?: unknown; label?: unknown; isNew?: unknown; assetId?: unknown };
      const photoId = requiredText(value.id, "Photo id", 100);
      const isNew = value.isNew === true;
      if ((isNew ? !photoId.startsWith("new:") : !allowedPhotoIds.has(photoId)) || seenPhotoIds.has(photoId) || deletedPhotoIds.includes(photoId)) {
        throw new Error("Invalid report photo.");
      }
      seenPhotoIds.add(photoId);
      let assetId = value.assetId === undefined ? appt.servicePhotos.find((photo) => photo.id === photoId)?.assetId ?? null : value.assetId;
      if (typeof assetId === "string" && deletedAssetIds.includes(assetId)) assetId = null;
      if (assetId !== null && (typeof assetId !== "string" || !finalAssetIds.has(assetId))) throw new Error("Invalid photo asset.");
      return {
        id: photoId,
        isNew,
        assetId,
        label: optionalText(value.label ?? "", "Photo name", 160),
      };
    });
    if (allowedPhotoIds.size - deletedPhotoIds.length + photos.filter((photo) => photo.isNew).length > 500) throw new Error("Too many report photos.");

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
    if (photos.some((photo) => photo.isNew && !replacementUrls.has(photo.id))) throw new Error("Choose an image for every new photo.");

    // D1 has no interactive transactions, so what upstream ran inside one runs
    // in sequence here. Order matters: deletions first, then asset writes, then
    // the recomputed total, then photos - so a failure part-way never leaves a
    // photo pointing at an asset row that has already gone.
    await prisma.report.update({
      where: { appointmentId: id },
      data: { technicianName, clientName, reportDate },
    });
    if (deletedPhotoIds.length) await prisma.servicePhoto.deleteMany({ where: { appointmentId: id, id: { in: deletedPhotoIds }, type: "EVIDENCE" } });
    if (deletedAssetIds.length) {
      await prisma.servicePhoto.updateMany({ where: { appointmentId: id, assetId: { in: deletedAssetIds } }, data: { assetId: null } });
      await prisma.appointmentAsset.deleteMany({ where: { appointmentId: id, id: { in: deletedAssetIds } } });
    }
    const assetIds = new Map<string, string>();
    for (const asset of assets) {
      const data = {
        label: asset.label, acType: asset.acType, jobCategoryId: asset.jobCategoryId,
        unitPrice: asset.unitPrice, billingType: asset.billingType as "CHARGEABLE" | "WARRANTY",
        isTroubleshoot: isTroubleshootCategoryName(categories.find((category) => category.id === asset.jobCategoryId)?.name),
        remarks: asset.remarks || null, technicianRemark: asset.technicianRemark || null,
        additionalAddress: asset.additionalAddress || null, propertyType: asset.propertyType,
        workLocationAddress: asset.workLocationAddress,
        ...(appt.assets.find((original) => original.id === asset.id)?.workLocationAddress !== asset.workLocationAddress
          ? { workLocationLat: null, workLocationLng: null } : {}),
      };
      if (asset.isNew) {
        const created = await prisma.appointmentAsset.create({ data: { ...data, appointmentId: id } });
        assetIds.set(asset.id, created.id);
      } else {
        await prisma.appointmentAsset.update({ where: { id: asset.id }, data });
      }
    }
    if (deletedAssetIds.length || assets.some((asset) => asset.isNew || asset.unitPrice !== Number(appt.assets.find((original) => original.id === asset.id)?.unitPrice) || asset.billingType !== appt.assets.find((original) => original.id === asset.id)?.billingType)) {
      const remaining = await prisma.appointmentAsset.findMany({ where: { appointmentId: id } });
      const totalPrice = Math.round(calculateChargeableAssetTotal(remaining) * 100) / 100;
      if (totalPrice > 99999999.99) throw new Error("Total price is too large.");
      await prisma.appointment.update({ where: { id }, data: { totalPrice } });
    }
    for (const photo of photos) {
      const assetId = photo.assetId ? assetIds.get(photo.assetId) ?? photo.assetId : null;
      if (photo.isNew) {
        await prisma.servicePhoto.create({ data: { appointmentId: id, assetId, type: "EVIDENCE", label: photo.label, photoUrl: replacementUrls.get(photo.id)! } });
      } else {
        await prisma.servicePhoto.update({
          where: { id: photo.id },
          data: { label: photo.label, assetId, ...(replacementUrls.has(photo.id) ? { photoUrl: replacementUrls.get(photo.id) } : {}) },
        });
      }
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
