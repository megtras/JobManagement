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
  if (role === "TECHNICIAN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const raw  = body.commission;
  const commission = raw === null || raw === "" || raw === undefined
    ? null
    : parseFloat(String(raw));

  if (commission !== null && (isNaN(commission) || commission < 0)) {
    return NextResponse.json({ error: "Invalid commission value" }, { status: 400 });
  }

  const appt = await prisma.appointment.findFirst({
    where: { id, ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}) },
    select: { id: true },
  });

  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.appointment.update({
    where: { id },
    data: { commission },
  });

  return NextResponse.json({ ok: true });
}
