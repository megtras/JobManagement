import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { uploadPublicUrl } from "@/lib/upload-urls";
import { technicianTeamAccessWhere } from "@/lib/task-access";
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

  const appt = await prisma.appointment.findFirst({
    where: { id, ...technicianTeamAccessWhere(session.user.id, session.user.name) },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("photo") as File | null;
  const type = form.get("type") as string; // "ATTENDANCE" | "EVIDENCE"
  const assetId = form.get("assetId") as string | null;
  const label = (form.get("label") as string | null)?.trim() ?? "";
  const photoId = clientGeneratedId(form.get("clientPhotoId"), "photo");
  const createdAt = capturedDate(form.get("createdAt"));

  if (photoId) {
    const existing = await prisma.servicePhoto.findUnique({ where: { id: photoId } });
    if (existing?.appointmentId === id) {
      return NextResponse.json({ ok: true, photoUrl: existing.photoUrl, photoId: existing.id });
    }
  }
  if (appt.clockOutAt) {
    return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
  }

  if (!file) return NextResponse.json({ error: "No photo" }, { status: 400 });
  if (type === "EVIDENCE" && !label) return NextResponse.json({ error: "Photo name is required" }, { status: 400 });

  const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", "photos");
  await mkdir(uploadDir, { recursive: true });

  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${id}-${type.toLowerCase()}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const photoUrl = uploadPublicUrl("photos", filename);

  await prisma.servicePhoto.create({
    data: {
      ...(photoId ? { id: photoId } : {}),
      appointmentId: id,
      assetId: assetId || null,
      photoUrl,
      label,
      type: type as "ATTENDANCE" | "EVIDENCE",
      createdAt,
    },
  });

  return NextResponse.json({ ok: true, photoUrl, photoId });
}

export async function DELETE(
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
    select: { id: true, clockOutAt: true },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appt.clockOutAt) {
    return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
  }

  const { photoId } = await req.json();
  if (!photoId) return NextResponse.json({ error: "Photo id required" }, { status: 400 });

  const photo = await prisma.servicePhoto.findFirst({
    where: { id: photoId, appointmentId: id },
    select: { id: true, photoUrl: true },
  });
  if (!photo && req.headers.get("x-offline-action-id")) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  await prisma.servicePhoto.delete({ where: { id: photo.id } });

  const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", "photos");
  await unlink(path.join(uploadDir, path.basename(photo.photoUrl))).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

export async function PATCH(
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
    select: { id: true, clockOutAt: true },
  });
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (appt.clockOutAt) {
    return NextResponse.json({ error: "Task already checked out" }, { status: 409 });
  }

  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  const form = isMultipart ? await req.formData() : new FormData();
  const body = isMultipart ? {} as { photoId?: string; label?: string } : await req.json();
  const photoId = isMultipart ? form.get("photoId") as string | null : body.photoId;
  const file = isMultipart ? form.get("photo") as File | null : null;
  const label = (isMultipart ? form.get("label") as string | null : body.label)?.trim() ?? "";

  if (!photoId) return NextResponse.json({ error: "Photo id required" }, { status: 400 });

  const photo = await prisma.servicePhoto.findFirst({
    where: { id: photoId, appointmentId: id },
    select: { id: true, photoUrl: true, type: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  if (photo.type === "EVIDENCE" && !label) {
    return NextResponse.json({ error: "Photo name is required" }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", "photos");
  const data: { label: string; photoUrl?: string } = { label };

  if (file) {
    await mkdir(uploadDir, { recursive: true });
    const ext = file.name.split(".").pop() ?? "jpg";
    const filename = `${id}-${photo.type.toLowerCase()}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);
    data.photoUrl = uploadPublicUrl("photos", filename);
  }

  await prisma.servicePhoto.update({
    where: { id: photo.id },
    data,
  });

  if (file) {
    await unlink(path.join(uploadDir, path.basename(photo.photoUrl))).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, photoUrl: data.photoUrl ?? photo.photoUrl });
}
