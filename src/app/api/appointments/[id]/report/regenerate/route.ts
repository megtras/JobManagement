import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { technicianTeamAccessWhere } from "@/lib/task-access";
import { regenerateServiceReportPdf } from "@/lib/pdf/regenerate-service-report";
import { whatsappReportLink } from "@/lib/public-url";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, branchId } = session.user;
  const accessWhere = role === "TECHNICIAN"
    ? technicianTeamAccessWhere(session.user.id, session.user.name)
    : role === "SUPERVISOR"
      ? {}
      : branchId
        ? { branchId }
        : { id: "__never__" };

  const appt = await prisma.appointment.findFirst({
    where: { id, ...accessWhere },
    select: { id: true, customer: { select: { phone: true } } },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const pdfUrl = await regenerateServiceReportPdf(id);
    const whatsappLink = whatsappReportLink(appt.customer.phone, pdfUrl, req);
    return NextResponse.json({ ok: true, pdfUrl, whatsappLink });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not regenerate report";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
