import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { technicianTeamAccessWhere } from "@/lib/task-access";
import { calculateChargeableAssetTotal, isTroubleshootCategoryName, type AssetBillingType } from "@/lib/appointment-pricing";
import { clientGeneratedId } from "@/lib/offline/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TECHNICIAN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const jobCategoryId = typeof body.jobCategoryId === "string" ? body.jobCategoryId : "";
  const clientAssetId = clientGeneratedId(body.clientAssetId, "asset");
  const requestedBillingType: AssetBillingType = body.billingType === "WARRANTY" ? "WARRANTY" : "CHARGEABLE";

  if (!jobCategoryId) {
    return NextResponse.json({ error: "Job category is required" }, { status: 400 });
  }

  const appt = await prisma.appointment.findFirst({
    where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
    select: {
      id: true,
      billingType: true,
      clockOutAt: true,
      locationAddress: true,
      locationLat: true,
      locationLng: true,
      assets: { select: { unitPrice: true, billingType: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clientAssetId) {
    const existing = await prisma.appointmentAsset.findFirst({
      where: { id: clientAssetId, appointmentId: id },
      include: { jobCategory: { select: { id: true, name: true, price: true, minEvidencePhotos: true } } },
    });
    if (existing) {
      return NextResponse.json({
        ...existing,
        unitPrice: existing.unitPrice.toString(),
        jobCategory: existing.jobCategory
          ? { ...existing.jobCategory, price: existing.jobCategory.price.toString() }
          : null,
      });
    }
  }
  if (appt.clockOutAt) {
    return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
  }

  const category = await prisma.jobCategory.findUnique({
    where: { id: jobCategoryId },
    select: { id: true, name: true, price: true },
  });
  if (!category) {
    return NextResponse.json({ error: "Job category not found" }, { status: 404 });
  }
  if (isTroubleshootCategoryName(category.name)) {
    return NextResponse.json({ error: "Choose a repair or service category after troubleshooting." }, { status: 422 });
  }

  const billingType: AssetBillingType = appt.billingType === "WARRANTY" ? requestedBillingType : "CHARGEABLE";

  const created = await prisma.$transaction(async (tx) => {
    const asset = await tx.appointmentAsset.create({
      data: {
        ...(clientAssetId ? { id: clientAssetId } : {}),
        appointment: { connect: { id } },
        label: "",
        acType: "Work Item",
        jobCategory: { connect: { id: category.id } },
        unitPrice: category.price,
        billingType,
        isTroubleshoot: false,
        remarks: null,
        propertyType: "Service",
        workLocationAddress: appt.locationAddress,
        workLocationLat: appt.locationLat,
        workLocationLng: appt.locationLng,
      },
      include: { jobCategory: { select: { id: true, name: true, price: true, minEvidencePhotos: true } } },
    });

    const total = calculateChargeableAssetTotal([...appt.assets, { unitPrice: category.price, billingType }]);
    await tx.appointment.update({
      where: { id },
      data: { totalPrice: total },
    });

    return asset;
  });

  return NextResponse.json({
    ...created,
    unitPrice: created.unitPrice.toString(),
    jobCategory: created.jobCategory ? { ...created.jobCategory, price: created.jobCategory.price.toString() } : null,
  });
}
