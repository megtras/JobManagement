import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Final "Approve & Close" for a completed job: marks the appointment approved
// and approves any still-pending payment in one step. Supervisor / Manager /
// Admin only, scoped to their branch.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, branchId, id: userId } = session.user;
  if (role === "TECHNICIAN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const appt = await prisma.appointment.findFirst({
    where: { id, ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}) },
    include: {
      customer: { select: { name: true } },
      teams: { select: { members: { select: { id: true } } } },
      payments: { select: { method: true, receiptPhotoUrl: true, status: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appt.status !== "DONE") {
    return NextResponse.json({ error: "The job is not finished yet. Only DONE jobs can be approved." }, { status: 422 });
  }
  if (appt.approvedAt) {
    return NextResponse.json({ error: "This job has already been approved." }, { status: 422 });
  }
  const officePaymentWithoutProof = appt.payments.some(
    (payment) => payment.status === "PENDING" && payment.method === "OFFICE" && !payment.receiptPhotoUrl
  );
  if (officePaymentWithoutProof) {
    return NextResponse.json(
      { error: "Office payment proof is required before approving and closing this job." },
      { status: 422 }
    );
  }

  await prisma.appointment.update({
    where: { id },
    data: { approvedAt: new Date(), approvedById: userId },
  });
  await prisma.payment.updateMany({
    where: { appointmentId: id, status: "PENDING" },
    data: { status: "APPROVED", approvedById: userId },
  });

  // Notify the technicians on the assigned team(s).
  const memberIds = [...new Set(appt.teams.flatMap((t) => t.members.map((m) => m.id)))];
  if (memberIds.length > 0) {
    await prisma.notification.createMany({
      data: memberIds.map((uid) => ({
        userId: uid,
        type: "JOB_APPROVED",
        message: `Job for ${appt.customer.name} has been approved and closed.`,
        relatedAppointmentId: id,
      })),
    });
  }

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  revalidatePath("/payments");
  revalidatePath(`/appointments/${id}`);

  return NextResponse.json({ ok: true });
}
