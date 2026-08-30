import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/haversine";
import { technicianTeamAccessWhere } from "@/lib/task-access";
import { capturedDate, clientGeneratedId } from "@/lib/offline/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TECHNICIAN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lat, lng, targetLat, targetLng, checkedInAt, clientCheckInId } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const appt = await prisma.appointment.findFirst({
    where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const checkInId = clientGeneratedId(clientCheckInId, "checkin");
  if (checkInId) {
    const existing = await prisma.checkIn.findUnique({ where: { id: checkInId } });
    if (existing?.appointmentId === id && existing.technicianId === session.user.id) {
      return NextResponse.json({ ok: true, checkInId: existing.id });
    }
  }
  if (appt.clockOutAt) {
    return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
  }

  const radius = Number(process.env.GEOFENCE_RADIUS_METERS ?? 200);
  const checkLat = typeof targetLat === "number" ? targetLat : appt.locationLat;
  const checkLng = typeof targetLng === "number" ? targetLng : appt.locationLng;
  if (typeof checkLat !== "number" || typeof checkLng !== "number") {
    return NextResponse.json({ error: "No work location set for this job yet." }, { status: 422 });
  }
  const distance = haversineDistance(lat, lng, checkLat, checkLng);

  if (distance > radius) {
    return NextResponse.json(
      { error: `You are ${Math.round(distance)}m away. Must be within ${radius}m to check in.` },
      { status: 422 }
    );
  }

  await prisma.checkIn.create({
    data: {
      ...(checkInId ? { id: checkInId } : {}),
      appointmentId: id,
      technicianId: session.user.id,
      lat,
      lng,
      checkedInAt: capturedDate(checkedInAt),
    },
  });

  await prisma.appointment.update({
    where: { id },
    data: { status: "IN_PROGRESS" },
  });

  return NextResponse.json({ ok: true, checkInId });
}
