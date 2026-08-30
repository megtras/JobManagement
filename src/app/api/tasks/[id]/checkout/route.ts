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

  const body = await req.json().catch(() => ({})) as { occurredAt?: string };
  const occurredAt = capturedDate(body.occurredAt);

  // Checkout records the technician's clock-out time (shown on the dashboard).
  // Keep the first checkout time if already set.
  await prisma.appointment.update({
    where: { id },
    data: { clockOutAt: appt.clockOutAt ?? occurredAt },
  });

  return NextResponse.json({ ok: true });
}
