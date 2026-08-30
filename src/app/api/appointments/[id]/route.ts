import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateAppointment } from "@/lib/actions/appointments";
import { buildWazeLink } from "@/lib/waze";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const appt = await prisma.appointment.findFirst({
    where: {
      id,
      ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}),
    },
    include: {
      customer: true,
      branch: true,
      jobCategory: true,
      technician: { select: { id: true, name: true, phone: true } },
      checkInSosRequester: { select: { id: true, name: true } },
      checkInSosResolver: { select: { id: true, name: true } },
      teams: { select: { id: true, name: true, members: { select: { id: true, name: true, phone: true } } } },
      assets: { include: { jobCategory: { select: { id: true, name: true, price: true } } } },
      parent: { select: { id: true, jobTitle: true } },
      subJobs: { select: { id: true, jobTitle: true, status: true, date: true }, orderBy: { date: "asc" } },
      checkIns: { orderBy: { checkedInAt: "asc" } },
      servicePhotos: { orderBy: { createdAt: "asc" } },
      payments: {
        orderBy: { createdAt: "desc" },
        include: { approvedBy: { select: { name: true } } },
      },
      report: true,
    },
  });

  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...appt,
    locationWazeLink: buildWazeLink(appt.locationAddress, appt.locationLat, appt.locationLng) || appt.locationWazeLink,
    totalPrice: appt.totalPrice.toString(),
    commission: appt.commission?.toString() ?? null,
    jobCategory: appt.jobCategory ? { ...appt.jobCategory, price: appt.jobCategory.price.toString() } : null,
    assets: appt.assets.map((a) => ({
      ...a,
      unitPrice: a.unitPrice.toString(),
      technicianRemark: a.technicianRemark ?? null,
      jobCategory: a.jobCategory ? { ...a.jobCategory, price: a.jobCategory.price.toString() } : null,
    })),
    payments: appt.payments.map((p) => ({ ...p, amount: p.amount.toString() })),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "TECHNICIAN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json() as {
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
      assets: Array<{
        id?: string;
        label: string;
        acType: string;
        jobCategoryId: string;
        unitPrice: number;
        remarks?: string;
        additionalAddress?: string;
        propertyType: string;
        workLocationAddress: string;
        workLocationLat?: number | null;
        workLocationLng?: number | null;
      }>;
    };

    await updateAppointment(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update appointment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
