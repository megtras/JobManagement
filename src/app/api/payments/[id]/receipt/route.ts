import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadPublicUrl } from "@/lib/upload-urls";
import { putUpload } from "@/lib/storage";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payment = await prisma.payment.findFirst({
    where: {
      id,
      method: "OFFICE",
      appointment: {
        ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}),
      },
    },
    select: { id: true, appointmentId: true },
  });
  if (!payment) return NextResponse.json({ error: "Office payment not found" }, { status: 404 });

  const form = await req.formData();
  const receipt = form.get("receipt") as File | null;
  if (!receipt || receipt.size === 0) {
    return NextResponse.json({ error: "Payment proof photo is required" }, { status: 400 });
  }

  const receiptBuffer = Buffer.from(await receipt.arrayBuffer());
  const isPdfReceipt = receipt.type === "application/pdf" || receipt.name.toLowerCase().endsWith(".pdf");
  if (!isPdfReceipt && !receipt.type.startsWith("image/")) {
    return NextResponse.json({ error: "Please upload a valid image or PDF file." }, { status: 400 });
  }
  const imageExtension = receipt.type === "image/png" ? "png" : receipt.type === "image/webp" ? "webp" : "jpg";
  const filename = isPdfReceipt
    ? `${payment.appointmentId}-office-receipt-${Date.now()}.pdf`
    : `${payment.appointmentId}-office-receipt-${Date.now()}.${imageExtension}`;

  await putUpload("photos", filename, receiptBuffer, isPdfReceipt ? "application/pdf" : receipt.type);
  const receiptPhotoUrl = uploadPublicUrl("photos", filename);

  await prisma.payment.update({
    where: { id },
    data: { receiptPhotoUrl },
  });

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  revalidatePath("/payments");
  revalidatePath(`/appointments/${payment.appointmentId}`);

  return NextResponse.json({ ok: true, receiptPhotoUrl });
}
