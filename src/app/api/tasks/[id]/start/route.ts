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

  const appt = await prisma.appointment.findFirst({
    where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appt.clockOutAt) {
    return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({})) as { occurredAt?: string };
  const occurredAt = capturedDate(body.occurredAt);

  await prisma.appointment.update({
    where: { id },
    // Starting the task is the technician's check-in. Keep the first check-in time.
    data: { status: "IN_PROGRESS", clockInAt: appt.clockInAt ?? occurredAt },
  });

  return NextResponse.json({ ok: true });
}
