import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { technicianTeamAccessWhere } from "@/lib/task-access";
import { capturedDate } from "@/lib/offline/server";

// A technician flags a task as urgent so managers/admins/supervisors can act on it.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TECHNICIAN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reason, occurredAt } = await req.json() as { reason?: string; occurredAt?: string };
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "Please describe why this task is urgent." }, { status: 400 });
  }

  const appt = await prisma.appointment.findFirst({
    where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
    include: { customer: { select: { name: true, phone: true } }, teams: { select: { name: true } } },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appt.urgent && appt.urgentReason === reason.trim()) {
    return NextResponse.json({ ok: true, alreadyFlagged: true });
  }

  await prisma.appointment.update({
    where: { id },
    data: { urgent: true, urgentReason: reason.trim(), urgentAt: capturedDate(occurredAt) },
  });

  // Notify every admin/manager in this branch plus all supervisors.
  const recipients = await prisma.user.findMany({
    where: {
      OR: [
        { role: { in: ["ADMIN", "MANAGER"] }, branchId: appt.branchId },
        { role: "SUPERVISOR" },
      ],
    },
    select: { id: true },
  });

  const teamName = appt.teams.map((t) => t.name).join(", ");
  const who = appt.customer.name || appt.customer.phone || "Customer";
  const jobLabel = `GP-${String(appt.jobNo).padStart(4, "0")}`;
  const message = `Urgent task ${jobLabel} (${who})${teamName ? ` — team ${teamName}` : ""}: ${reason.trim()}`;

  if (recipients.length > 0) {
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        type: "URGENT_TASK",
        message,
        relatedAppointmentId: id,
      })),
    });
  }

  return NextResponse.json({ ok: true });
}
