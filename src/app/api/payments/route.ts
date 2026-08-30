import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "PENDING" | "APPROVED" | "REJECTED" | null;

  const payments = await prisma.payment.findMany({
    where: {
      ...(status ? { status } : {}),
      appointment: {
        ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}),
      },
    },
    include: {
      appointment: {
        include: {
          customer: { select: { name: true, phone: true } },
          technician: { select: { name: true } },
          branch: { select: { id: true, name: true } },
          jobCategory: { select: { name: true } },
        },
      },
      approvedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount.toString(),
      receiptPhotoUrl: p.receiptPhotoUrl,
      status: p.status,
      rejectReason: p.rejectReason,
      createdAt: p.createdAt,
      approvedBy: p.approvedBy,
      appointment: {
        id: p.appointment.id,
        date: p.appointment.date,
        status: p.appointment.status,
        approvedAt: p.appointment.approvedAt ? p.appointment.approvedAt.toISOString() : null,
        customer: p.appointment.customer,
        technician: p.appointment.technician,
        branch: p.appointment.branch,
        jobCategory: p.appointment.jobCategory,
      },
    }))
  );
}
