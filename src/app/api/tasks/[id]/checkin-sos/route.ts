import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { technicianTeamAccessWhere } from "@/lib/task-access";
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

  const body = await req.json().catch(() => ({})) as {
    address?: string;
    targetLat?: number | null;
    targetLng?: number | null;
    requestedAt?: string;
  };

  const appt = await prisma.appointment.findFirst({
    where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
    include: {
      customer: { select: { name: true, phone: true } },
      teams: { select: { name: true } },
      checkIns: { select: { id: true }, take: 1 },
    },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appt.checkIns.length > 0) {
    return NextResponse.json({ error: "This task has already checked in." }, { status: 409 });
  }

  const address = typeof body.address === "string" && body.address.trim()
    ? body.address.trim()
    : appt.locationAddress;
  const targetLat = typeof body.targetLat === "number" ? body.targetLat : appt.locationLat;
  const targetLng = typeof body.targetLng === "number" ? body.targetLng : appt.locationLng;
  if (
    appt.checkInSosRequestedAt &&
    !appt.checkInSosResolvedAt &&
    appt.checkInSosAddress === address
  ) {
    return NextResponse.json({ ok: true, alreadyRequested: true });
  }

  await prisma.appointment.update({
    where: { id },
    data: {
      checkInSosRequestedAt: capturedDate(body.requestedAt),
      checkInSosRequestedById: session.user.id,
      checkInSosAddress: address,
      checkInSosLat: targetLat,
      checkInSosLng: targetLng,
      checkInSosResolvedAt: null,
      checkInSosResolvedById: null,
    },
  });

  const recipients = await prisma.user.findMany({
    where: {
      OR: [
        { role: { in: ["ADMIN", "MANAGER"] }, branchId: appt.branchId },
        { role: "SUPERVISOR" },
      ],
    },
    select: { id: true },
  });

  const teamName = appt.teams.map((t) => t.name).join(", ") || session.user.name || "Technician";
  const jobLabel = `GP-${String(appt.jobNo).padStart(4, "0")}`;
  const customer = appt.customer.name || appt.customer.phone || "customer";
  const message = `SOS check-in request from ${teamName} for ${jobLabel} (${customer}). Please help them check in.`;

  if (recipients.length > 0) {
    await prisma.notification.createMany({
      data: recipients.map((recipient) => ({
        userId: recipient.id,
        type: "SOS_CHECKIN",
        message,
        relatedAppointmentId: id,
      })),
    });
  }

  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/notifications");

  return NextResponse.json({ ok: true });
}
