"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Role } from "@/generated/prisma/client";
import { buildWazeLink } from "@/lib/waze";
import { nextJobNo } from "@/lib/record-numbers";
import { calculateChargeableAssetTotal, isTroubleshootCategoryName, type AssetBillingType } from "@/lib/appointment-pricing";

async function getSession() {
  const s = await getServerSession(authOptions);
  if (!s?.user) throw new Error("Unauthorized");
  return s;
}

function branchFilter(role: Role, userBranchId: string | null, filterBranchId?: string) {
  if (role === "SUPERVISOR") return filterBranchId ? { branchId: filterBranchId } : {};
  return { branchId: userBranchId! };
}

type AppointmentBillingType = "CHARGEABLE" | "WARRANTY";

function normalizeBillingType(value?: AppointmentBillingType | null): AppointmentBillingType {
  return value === "WARRANTY" ? "WARRANTY" : "CHARGEABLE";
}

function normalizeWarrantyNote(value?: string | null) {
  const note = value?.trim();
  return note ? note : null;
}

type AppointmentAssetInput = {
  id?: string;
  label: string;
  acType: string;
  jobCategoryId: string;
  unitPrice: number;
  billingType?: AssetBillingType | null;
  remarks?: string;
  additionalAddress?: string;
  propertyType: string;
  workLocationAddress: string;
  workLocationLat?: number | null;
  workLocationLng?: number | null;
};

type ValidatedAppointmentAsset = ReturnType<typeof validateAppointmentInput>["assets"][number];

function validateAppointmentInput(data: {
  jobTitle: string;
  teamIds?: string[];
  assets: AppointmentAssetInput[];
}) {
  const jobTitle = data.jobTitle.trim();
  const teamIds = (data.teamIds ?? []).filter(Boolean);
  const assets = data.assets.map((a) => ({
    id: typeof a.id === "string" && a.id ? a.id : undefined,
    label: a.label.trim(),
    acType: a.acType.trim(),
    jobCategoryId: a.jobCategoryId,
    unitPrice: Number(a.unitPrice) || 0,
    billingType: (a.billingType === "WARRANTY" ? "WARRANTY" : "CHARGEABLE") as AssetBillingType,
    remarks: a.remarks?.trim() || null,
    additionalAddress: a.additionalAddress?.trim() || undefined,
    propertyType: a.propertyType.trim(),
    workLocationAddress: a.workLocationAddress.trim(),
    workLocationLat: a.workLocationLat ?? null,
    workLocationLng: a.workLocationLng ?? null,
  }));

  // Minimum to set an appointment: customer + job title + date + time. Team, work
  // location and assets are optional and can be filled in later by editing the job.
  if (!jobTitle) throw new Error("Job title is required.");
  // Label is optional — only AC type, job category, property type and work location are required.
  if (assets.some((a) => !a.acType || !a.jobCategoryId || !a.propertyType || !a.workLocationAddress))
    throw new Error("Every asset must have an AC type, job category, property type, and work location.");
  if (assets.some((a) => a.unitPrice < 0)) throw new Error("Asset price cannot be negative.");

  return { jobTitle, teamIds, assets };
}

async function attachCategoryNames(assets: ValidatedAppointmentAsset[]) {
  const categoryIds = [...new Set(assets.map((asset) => asset.jobCategoryId).filter(Boolean))];
  const categories = categoryIds.length > 0
    ? await prisma.jobCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
    : [];
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  return assets.map((asset) => ({
    ...asset,
    jobCategoryName: categoryNameById.get(asset.jobCategoryId) ?? "",
  }));
}

type AppointmentAssetWithCategory = Awaited<ReturnType<typeof attachCategoryNames>>[number];

/** Confirm every team exists and belongs to the appointment's branch. */
async function assertTeamsInBranch(teamIds: string[], branchId: string) {
  const teams = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, branchId: true } });
  if (teams.length !== teamIds.length) throw new Error("Invalid team selection.");
  if (teams.some((t) => t.branchId !== branchId)) throw new Error("The team must belong to the same branch.");
}

async function createAppointmentAsset(
  appointmentId: string,
  asset: AppointmentAssetWithCategory
) {
  await prisma.appointmentAsset.create({
    data: {
      appointment: { connect: { id: appointmentId } },
      label: asset.label,
      acType: asset.acType,
      unitPrice: asset.unitPrice,
      billingType: asset.billingType,
      isTroubleshoot: isTroubleshootCategoryName(asset.jobCategoryName),
      remarks: asset.remarks,
      additionalAddress: asset.additionalAddress || null,
      propertyType: asset.propertyType,
      workLocationAddress: asset.workLocationAddress,
      workLocationLat: asset.workLocationLat,
      workLocationLng: asset.workLocationLng,
      ...(asset.jobCategoryId ? { jobCategory: { connect: { id: asset.jobCategoryId } } } : {}),
    },
  });
}

function appointmentAssetData(asset: AppointmentAssetWithCategory) {
  return {
    label: asset.label,
    acType: asset.acType,
    unitPrice: asset.unitPrice,
    billingType: asset.billingType,
    isTroubleshoot: isTroubleshootCategoryName(asset.jobCategoryName),
    remarks: asset.remarks,
    additionalAddress: asset.additionalAddress || null,
    propertyType: asset.propertyType,
    workLocationAddress: asset.workLocationAddress,
    workLocationLat: asset.workLocationLat,
    workLocationLng: asset.workLocationLng,
    ...(asset.jobCategoryId ? { jobCategory: { connect: { id: asset.jobCategoryId } } } : { jobCategory: { disconnect: true } }),
  };
}

function assetKeyPart(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function assetSignature(asset: {
  label?: string | null;
  acType?: string | null;
  jobCategoryId?: string | null;
  propertyType?: string | null;
  workLocationAddress?: string | null;
  additionalAddress?: string | null;
}) {
  return [
    assetKeyPart(asset.label),
    assetKeyPart(asset.acType),
    assetKeyPart(asset.jobCategoryId),
    assetKeyPart(asset.propertyType),
    assetKeyPart(asset.workLocationAddress),
    assetKeyPart(asset.additionalAddress),
  ].join("|");
}

export async function getAppointments(filterBranchId?: string, statusFilter?: string) {
  const session = await getSession();
  const { role, branchId } = session.user;
  return prisma.appointment.findMany({
    where: {
      ...branchFilter(role, branchId, filterBranchId),
      ...(statusFilter ? { status: statusFilter as "COMING_SOON" | "IN_PROGRESS" | "DONE" } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      branch: { select: { id: true, name: true } },
      jobCategory: { select: { id: true, name: true, price: true } },
      technician: { select: { id: true, name: true } },
      teams: { select: { id: true, name: true, members: { select: { id: true, name: true } } } },
      assets: { include: { jobCategory: { select: { id: true, name: true, price: true } } } },
      parent: { select: { id: true, jobTitle: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, method: true, receiptPhotoUrl: true } },
      _count: { select: { subJobs: true } },
    },
    orderBy: { date: "asc" },
  });
}

export async function createAppointment(data: {
  customerId: string;
  jobTitle: string;
  date: string;
  time: string;
  timeFinish?: string;
  teamIds: string[];
  parentId?: string;
  locationAddress?: string;
  locationLat?: number | null;
  locationLng?: number | null;
  billingType?: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  assets: AppointmentAssetInput[];
}) {
  const session = await getSession();
  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") throw new Error("Unauthorized");

  const validated = validateAppointmentInput(data);

  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) throw new Error("Customer not found.");
  if (role !== "SUPERVISOR" && customer.branchId !== branchId) throw new Error("Unauthorized");

  await assertTeamsInBranch(validated.teamIds, customer.branchId);

  const billingType = normalizeBillingType(data.billingType);
  const assets = await attachCategoryNames(validated.assets);
  const total = calculateChargeableAssetTotal(assets);
  const primaryCategoryId = assets[0]?.jobCategoryId ?? null;
  const lat = data.locationLat ?? null;
  const lng = data.locationLng ?? null;
  const wazeLink = buildWazeLink(data.locationAddress, lat, lng);
  const jobNo = await nextJobNo();

  const appointment = await prisma.appointment.create({
    data: {
      jobNo,
      customer: { connect: { id: data.customerId } },
      branch: { connect: { id: customer.branchId } },
      ...(primaryCategoryId ? { jobCategory: { connect: { id: primaryCategoryId } } } : {}),
      ...(data.parentId ? { parent: { connect: { id: data.parentId } } } : {}),
      teams: { connect: validated.teamIds.map((teamId) => ({ id: teamId })) },
      jobTitle: validated.jobTitle,
      date: new Date(data.date),
      time: data.time,
      timeFinish: data.timeFinish?.trim() ?? "",
      locationAddress: data.locationAddress?.trim() ?? "",
      locationLat: lat,
      locationLng: lng,
      locationWazeLink: wazeLink,
      status: "COMING_SOON",
      billingType,
      warrantyNote: normalizeWarrantyNote(data.warrantyNote),
      totalPrice: total,
    },
  });

  for (const asset of assets) {
    await createAppointmentAsset(appointment.id, asset);
  }

  // Setting an appointment closes the deal: a pending-deal customer becomes closed.
  if (customer.status !== "CLOSED") {
    await prisma.customer.update({ where: { id: customer.id }, data: { status: "CLOSED" } });
  }

  revalidatePath("/appointments");
  revalidatePath("/customers");
  return { id: appointment.id };
}

export async function updateAppointment(
  id: string,
  data: {
    jobTitle: string;
    date: string;
    time: string;
    timeFinish?: string;
    teamIds: string[];
    locationAddress?: string;
    locationLat?: number | null;
    locationLng?: number | null;
    billingType?: "CHARGEABLE" | "WARRANTY";
    warrantyNote?: string | null;
    status: "COMING_SOON" | "IN_PROGRESS" | "DONE";
    assets: AppointmentAssetInput[];
  }
) {
  const session = await getSession();
  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") throw new Error("Unauthorized");

  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) throw new Error("Appointment not found.");
  if (role !== "SUPERVISOR" && appt.branchId !== branchId) throw new Error("Unauthorized");
  if (data.status !== appt.status && role !== "MANAGER" && role !== "SUPERVISOR") {
    throw new Error("Only manager and supervisor can change job status.");
  }
  const validated = validateAppointmentInput(data);
  await assertTeamsInBranch(validated.teamIds, appt.branchId);

  const billingType = normalizeBillingType(data.billingType);
  const assets = await attachCategoryNames(validated.assets);
  const total = calculateChargeableAssetTotal(assets);
  const primaryCategoryId = assets[0]?.jobCategoryId ?? null;
  const lat = data.locationLat ?? null;
  const lng = data.locationLng ?? null;
  const wazeLink = buildWazeLink(data.locationAddress, lat, lng);

  await prisma.appointment.update({
      where: { id },
      data: {
        jobCategory: primaryCategoryId ? { connect: { id: primaryCategoryId } } : { disconnect: true },
        teams: { set: validated.teamIds.map((teamId) => ({ id: teamId })) },
        jobTitle: validated.jobTitle,
        date: new Date(data.date),
        time: data.time,
        timeFinish: data.timeFinish?.trim() ?? "",
        locationAddress: data.locationAddress?.trim() ?? "",
        locationLat: lat,
        locationLng: lng,
        locationWazeLink: wazeLink,
        status: data.status,
        billingType,
        warrantyNote: normalizeWarrantyNote(data.warrantyNote),
        totalPrice: total,
      },
    });

  if (total <= 0) {
    await prisma.payment.deleteMany({ where: { appointmentId: id } });
  }

  const existingAssets = await prisma.appointmentAsset.findMany({
      where: { appointmentId: id },
      select: {
        id: true,
        label: true,
        acType: true,
        jobCategoryId: true,
        propertyType: true,
        workLocationAddress: true,
        additionalAddress: true,
        technicianRemark: true,
        _count: { select: { servicePhotos: true } },
      },
    });
    const existingAssetIds = new Set(existingAssets.map((asset) => asset.id));
    const retainedAssetIds = new Set<string>();
    const hasAssetEvidence = (asset: (typeof existingAssets)[number]) =>
      asset._count.servicePhotos > 0 || Boolean(asset.technicianRemark);
    const findUnretainedExistingAsset = (asset: ValidatedAppointmentAsset, requireEvidence: boolean) => {
      const signature = assetSignature(asset);
      return existingAssets.find(
        (existing) =>
          !retainedAssetIds.has(existing.id) &&
          assetSignature(existing) === signature &&
          (!requireEvidence || hasAssetEvidence(existing))
      );
    };

    for (const asset of assets) {
      const sameSignatureProtected = findUnretainedExistingAsset(asset, true);
      const sameSignatureExisting = findUnretainedExistingAsset(asset, false);
      const targetAssetId =
        sameSignatureProtected?.id ??
        (asset.id && existingAssetIds.has(asset.id) && !retainedAssetIds.has(asset.id) ? asset.id : undefined) ??
        sameSignatureExisting?.id;

      if (targetAssetId) {
        await prisma.appointmentAsset.update({
          where: { id: targetAssetId },
          data: appointmentAssetData(asset),
        });
        retainedAssetIds.add(targetAssetId);
      } else {
        await createAppointmentAsset(id, asset);
      }
    }

    const removableAssetIds = existingAssets
      .filter((asset) => !retainedAssetIds.has(asset.id))
      .filter((asset) => asset._count.servicePhotos === 0 && !asset.technicianRemark)
      .map((asset) => asset.id);

    if (removableAssetIds.length > 0) {
      await prisma.appointmentAsset.deleteMany({
        where: { appointmentId: id, id: { in: removableAssetIds } },
      });
    }
  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

/** Clear the urgent flag once a manager/admin/supervisor has acted on it. */
export async function resolveUrgent(id: string) {
  const session = await getSession();
  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") throw new Error("Unauthorized");

  const appt = await prisma.appointment.findUnique({ where: { id }, select: { branchId: true } });
  if (!appt) throw new Error("Appointment not found.");
  if (role !== "SUPERVISOR" && appt.branchId !== branchId) throw new Error("Unauthorized");

  await prisma.appointment.update({
    where: { id },
    data: { urgent: false, urgentReason: null, urgentAt: null },
  });
  revalidatePath("/appointments");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  revalidatePath(`/appointments/${id}`);
}

export async function deleteAppointment(id: string) {
  const session = await getSession();
  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") throw new Error("Unauthorized");

  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) throw new Error("Appointment not found.");
  if (role !== "SUPERVISOR" && appt.branchId !== branchId) throw new Error("Unauthorized");

  // Several child relations have no ON DELETE CASCADE, so remove them first.
  // Photos must go before assets (a photo can reference an asset). Sub-jobs are
  // unlinked (kept as standalone) and notifications are detached.
  await prisma.servicePhoto.deleteMany({ where: { appointmentId: id } });
  await prisma.checkIn.deleteMany({ where: { appointmentId: id } });
  await prisma.payment.deleteMany({ where: { appointmentId: id } });
  await prisma.report.deleteMany({ where: { appointmentId: id } });
  await prisma.notification.updateMany({ where: { relatedAppointmentId: id }, data: { relatedAppointmentId: null } });
  await prisma.appointment.updateMany({ where: { parentId: id }, data: { parentId: null } });
  await prisma.appointment.delete({ where: { id } });
  revalidatePath("/appointments");
  revalidatePath("/customers");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}

export async function getTechniciansForBranch(branchId?: string) {
  const session = await getSession();
  const { role, branchId: userBranch } = session.user;
  const targetBranch = role === "SUPERVISOR" ? branchId : userBranch;
  return prisma.user.findMany({
    where: { role: "TECHNICIAN", ...(targetBranch ? { branchId: targetBranch } : {}) },
    select: { id: true, name: true, technicianStatus: true, branchId: true },
    orderBy: { name: "asc" },
  });
}
