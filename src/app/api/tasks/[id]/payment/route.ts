import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { uploadPublicUrl } from "@/lib/upload-urls";
import { technicianTeamAccessWhere } from "@/lib/task-access";
import { validateTaskEvidenceReady } from "@/lib/task-evidence";
import { capturedDate, clientGeneratedId } from "@/lib/offline/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TECHNICIAN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const method = form.get("method") as string; // CASH | QR_TRANSFER | OFFICE
  const receipt = form.get("receipt") as File | null;
  const paymentId = clientGeneratedId(form.get("clientPaymentId"), "payment");
  const submittedAt = capturedDate(form.get("submittedAt"));

  if (!["CASH", "QR_TRANSFER", "OFFICE"].includes(method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const appt = await prisma.appointment.findFirst({
    where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
    include: {
      branch: true,
      assets: { select: { id: true, jobCategory: { select: { minEvidencePhotos: true } } } },
      servicePhotos: { select: { type: true, assetId: true } },
    },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (paymentId) {
    const existing = await prisma.payment.findFirst({
      where: { id: paymentId, appointmentId: id },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        paymentId: existing.id,
        method: existing.method,
        status: existing.status,
      });
    }
  }
  if (Number(appt.totalPrice) <= 0) {
    return NextResponse.json({ error: "Payment is not required for FOC jobs." }, { status: 422 });
  }
  if (appt.clockOutAt) {
    return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
  }
  const minEvidencePhotos = Math.max(3, Number(process.env.MIN_EVIDENCE_PHOTOS ?? 3));
  const evidenceError = validateTaskEvidenceReady(appt, minEvidencePhotos);
  if (evidenceError) {
    return NextResponse.json({ error: evidenceError }, { status: 422 });
  }

  // Cash and QR/Transfer both require proof of payment; only Pay Office is exempt.
  if (method !== "OFFICE" && !receipt) {
    return NextResponse.json({ error: "A live receipt photo is required for this payment method" }, { status: 400 });
  }

  let receiptPhotoUrl: string | null = null;

  if (receipt && (method === "CASH" || method === "QR_TRANSFER")) {
    const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", "photos");
    await mkdir(uploadDir, { recursive: true });
    const ext = receipt.name.split(".").pop() ?? "jpg";
    const filename = `${id}-receipt-${Date.now()}.${ext}`;
    await writeFile(path.join(uploadDir, filename), Buffer.from(await receipt.arrayBuffer()));
    receiptPhotoUrl = uploadPublicUrl("photos", filename);
  }

  const payment = await prisma.payment.create({
    data: {
      ...(paymentId ? { id: paymentId } : {}),
      appointmentId: id,
      method: method as "CASH" | "QR_TRANSFER" | "OFFICE",
      amount: appt.totalPrice,
      receiptPhotoUrl,
      status: "PENDING",
      createdAt: submittedAt,
    },
  });

  // Notify admins in the branch for Cash/QR
  if (method !== "OFFICE") {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", branchId: appt.branchId },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "PAYMENT_SUBMITTED",
          message: `Payment submitted for appointment ${id}. Method: ${method}. Please verify.`,
          relatedAppointmentId: id,
        })),
      });
    }
  }

  return NextResponse.json({ ok: true, paymentId: payment.id, method, status: payment.status });
}
