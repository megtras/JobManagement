import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, rejectReason } = await req.json() as { action?: string; rejectReason?: string };
  if (!action || !["APPROVE", "REJECT"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id,
      appointment: {
        ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}),
      },
    },
    include: {
      appointment: { select: { technicianId: true, id: true } },
    },
  });

  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payment.status !== "PENDING") {
    return NextResponse.json({ error: "Payment already processed" }, { status: 422 });
  }

  const updated = await prisma.payment.update({
    where: { id },
    data: {
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      approvedById: session.user.id,
      ...(action === "REJECT" ? { rejectReason: rejectReason ?? "Rejected" } : {}),
    },
  });

  // Notify the technician
  if (payment.appointment.technicianId) {
    await prisma.notification.create({
      data: {
        userId: payment.appointment.technicianId,
        type: action === "APPROVE" ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED",
        message:
          action === "APPROVE"
            ? `Your payment of RM ${payment.amount} has been approved.`
            : `Your payment of RM ${payment.amount} was rejected: ${rejectReason ?? "No reason provided"}.`,
        relatedAppointmentId: payment.appointment.id,
      },
    });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
