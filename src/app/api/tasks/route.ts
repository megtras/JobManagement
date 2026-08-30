import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyOverdueTasksForReschedule, startOfToday } from "@/lib/overdue-tasks";
import { technicianTeamAccessWhere } from "@/lib/task-access";
import { buildWazeLink } from "@/lib/waze";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TECHNICIAN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfToday();
  await notifyOverdueTasksForReschedule();

  const appointments = await prisma.appointment.findMany({
    where: {
      ...technicianTeamAccessWhere(session.user.id, session.user.name),
      status: { in: ["COMING_SOON", "IN_PROGRESS"] },
      date: { gte: today },
    },
    include: {
      customer: { select: { name: true, phone: true, area: true } },
      jobCategory: { select: { name: true } },
      _count: { select: { checkIns: true, servicePhotos: true } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(
    appointments.map((a) => ({
      id: a.id,
      jobNo: a.jobNo,
      date: a.date,
      time: a.time,
      timeFinish: a.timeFinish,
      clockOutAt: a.clockOutAt ? a.clockOutAt.toISOString() : null,
      status: a.status,
      urgent: a.urgent ?? false,
      locationAddress: a.locationAddress,
      locationLat: a.locationLat,
      locationLng: a.locationLng,
      locationWazeLink: buildWazeLink(a.locationAddress, a.locationLat, a.locationLng) || a.locationWazeLink,
      totalPrice: a.totalPrice.toString(),
      billingType: a.billingType,
      warrantyNote: a.warrantyNote,
      jobTitle: a.jobTitle,
      customer: a.customer,
      jobCategory: a.jobCategory,
      checkInCount: a._count.checkIns,
      photoCount: a._count.servicePhotos,
    }))
  );
}
