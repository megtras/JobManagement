import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Two-way Yes/No toggle for a payment's approval (used on the dashboard table).
// APPROVED <-> PENDING, so a re-opened job can be corrected. Staff only.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, branchId, id: userId } = session.user;
  if (role === "TECHNICIAN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payment = await prisma.payment.findFirst({
    where: { id, appointment: { ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}) } },
    select: { id: true, status: true, method: true, receiptPhotoUrl: true, appointmentId: true },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nextStatus = payment.status === "APPROVED" ? "PENDING" : "APPROVED";
  if (nextStatus === "APPROVED" && payment.method === "OFFICE" && !payment.receiptPhotoUrl) {
    return NextResponse.json(
      { error: "Office payment proof is required before marking payment as received." },
      { status: 422 }
    );
  }

  await prisma.payment.update({
    where: { id },
    data: {
      status: nextStatus,
      approvedById: nextStatus === "APPROVED" ? userId : null,
      ...(nextStatus === "APPROVED" ? { rejectReason: null } : {}),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/appointments");
  revalidatePath("/payments");
  revalidatePath(`/appointments/${payment.appointmentId}`);

  return NextResponse.json({ ok: true, status: nextStatus });
}
