import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "TECHNICIAN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role, branchId } = session.user;
  const appt = await prisma.appointment.findFirst({
    where: { id },
    include: {
      checkIns: { select: { id: true }, take: 1 },
      checkInSosRequester: { select: { id: true, name: true } },
      teams: { select: { name: true, members: { select: { id: true, name: true } } } },
    },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role !== "SUPERVISOR" && appt.branchId !== branchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requesterId =
    appt.checkInSosRequestedById ??
    appt.technicianId ??
    appt.teams.flatMap((team) => team.members).find((member) => member.id)?.id;
  if (!requesterId) {
    return NextResponse.json({ error: "No technician account found for this SOS request." }, { status: 422 });
  }

  const checkLat = appt.checkInSosLat ?? appt.locationLat;
  const checkLng = appt.checkInSosLng ?? appt.locationLng;
  if (typeof checkLat !== "number" || typeof checkLng !== "number") {
    return NextResponse.json({ error: "This SOS location has no GPS pin." }, { status: 422 });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (appt.checkIns.length === 0) {
      await tx.checkIn.create({
        data: {
          appointmentId: id,
          technicianId: requesterId,
          lat: checkLat,
          lng: checkLng,
          source: "SOS_PUSH",
          approvedById: session.user.id,
        },
      });
    }

    await tx.appointment.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        clockInAt: appt.clockInAt ?? now,
        checkInSosResolvedAt: new Date(),
        checkInSosResolvedById: session.user.id,
      },
    });
  });

  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true });
}
