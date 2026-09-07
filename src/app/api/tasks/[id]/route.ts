import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { capturedDate } from "@/lib/offline/server";
import { technicianTeamAccessWhere } from "@/lib/task-access";
import { buildWazeLink } from "@/lib/waze";

function serializeTaskAsset(a: {
  unitPrice: { toString(): string };
  technicianRemark?: string | null;
  jobCategory?: ({ price: { toString(): string } } & Record<string, unknown>) | null;
} & Record<string, unknown>) {
  return {
    ...a,
    unitPrice: a.unitPrice.toString(),
    technicianRemark: a.technicianRemark ?? null,
    jobCategory: a.jobCategory ? { ...a.jobCategory, price: a.jobCategory.price.toString() } : null,
  };
}

function serializePreviousAppointment(parent: ({
  totalPrice: { toString(): string };
  billingType?: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  locationAddress: string;
  locationLat: number | null;
  locationLng: number | null;
  locationWazeLink: string;
  jobCategory?: ({ price: { toString(): string } } & Record<string, unknown>) | null;
  assets: Array<Parameters<typeof serializeTaskAsset>[0]>;
} & Record<string, unknown>) | null) {
  if (!parent) return null;

  return {
    ...parent,
    locationWazeLink: buildWazeLink(parent.locationAddress, parent.locationLat, parent.locationLng) || parent.locationWazeLink,
    totalPrice: parent.totalPrice.toString(),
    billingType: parent.billingType,
    warrantyNote: parent.warrantyNote,
    jobCategory: parent.jobCategory ? { ...parent.jobCategory, price: parent.jobCategory.price.toString() } : null,
    assets: parent.assets.map(serializeTaskAsset),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TECHNICIAN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appt, jobCategories] = await Promise.all([
    prisma.appointment.findFirst({
      where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
      include: {
        customer: true,
        jobCategory: true,
        teams: { select: { id: true, name: true, members: { select: { name: true } } } },
        checkInSosResolver: { select: { id: true, name: true } },
        assets: { include: { jobCategory: { select: { id: true, name: true, price: true, minEvidencePhotos: true } } } },
        checkIns: { orderBy: { checkedInAt: "asc" } },
        servicePhotos: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "desc" } },
        report: true,
        parent: {
          include: {
            customer: true,
            jobCategory: true,
            teams: { select: { id: true, name: true, members: { select: { name: true } } } },
            assets: { include: { jobCategory: { select: { id: true, name: true, price: true, minEvidencePhotos: true } } } },
            servicePhotos: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    }),
    prisma.jobCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true, minEvidencePhotos: true },
    }),
  ]);

  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { parent, ...task } = appt;

  return NextResponse.json({
    ...task,
    locationWazeLink: buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink,
    clockOutAt: task.clockOutAt ? task.clockOutAt.toISOString() : null,
    totalPrice: task.totalPrice.toString(),
    billingType: task.billingType,
    warrantyNote: task.warrantyNote,
    jobCategory: task.jobCategory ? { ...task.jobCategory, price: task.jobCategory.price.toString() } : null,
    assets: task.assets.map(serializeTaskAsset),
    jobCategories: jobCategories.map((category) => ({ ...category, price: category.price.toString() })),
    previousAppointment: serializePreviousAppointment(parent),
  });
}

export async function PATCH(
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
    select: { id: true, clockOutAt: true },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { assetId, technicianRemark } = await req.json() as { assetId?: string; technicianRemark?: string };
  if (typeof assetId !== "string" || !assetId) {
    return NextResponse.json({ error: "Asset id required" }, { status: 400 });
  }

  const asset = await prisma.appointmentAsset.findFirst({
    where: { id: assetId, appointmentId: id },
    select: { id: true, technicianRemark: true },
  });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const nextRemark = typeof technicianRemark === "string" && technicianRemark.trim()
    ? technicianRemark.trim()
    : null;

  if (appt.clockOutAt) {
    const capturedAt = capturedDate(req.headers.get("X-Offline-Captured-At"));
    const capturedBeforeCheckout = capturedAt.getTime() <= appt.clockOutAt.getTime();
    if (!capturedBeforeCheckout) {
      return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
    }
    if (asset.technicianRemark && asset.technicianRemark !== nextRemark) {
      return NextResponse.json(
        { error: "A technician remark was already saved before checkout" },
        { status: 409 },
      );
    }
    if (asset.technicianRemark === nextRemark) {
      return NextResponse.json(asset);
    }
  }

  const updated = await prisma.appointmentAsset.update({
    where: { id: asset.id },
    data: { technicianRemark: nextRemark },
    select: { id: true, technicianRemark: true },
  });

  return NextResponse.json(updated);
}
