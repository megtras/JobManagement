"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function assertStaff(role: string | undefined) {
  if (!role || role === "TECHNICIAN") throw new Error("Unauthorized");
}

type PhotoTemplateMinimum = 3 | 5 | 10;

function normalizePhotoTemplate(value?: number): PhotoTemplateMinimum {
  return value === 5 || value === 10 ? value : 3;
}

export async function getJobCategories() {
  // Any authenticated user can read categories (needed for appointment forms)
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  return prisma.jobCategory.findMany({ orderBy: { name: "asc" } });
}

export async function createJobCategory(data: { name: string; price: number; minEvidencePhotos?: number }) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);
  if (!data.name.trim()) throw new Error("Category name is required.");
  if (data.price < 0) throw new Error("Price cannot be negative.");

  await prisma.jobCategory.create({
    data: { name: data.name.trim(), price: data.price, minEvidencePhotos: normalizePhotoTemplate(data.minEvidencePhotos) },
  });
  revalidatePath("/inventory");
  revalidatePath("/appointments");
}

export async function updateJobCategory(
  id: string,
  data: { name: string; price: number; minEvidencePhotos?: number }
) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);
  if (!data.name.trim()) throw new Error("Category name is required.");
  if (data.price < 0) throw new Error("Price cannot be negative.");

  await prisma.jobCategory.update({
    where: { id },
    data: { name: data.name.trim(), price: data.price, minEvidencePhotos: normalizePhotoTemplate(data.minEvidencePhotos) },
  });
  revalidatePath("/inventory");
  revalidatePath("/appointments");
}

export async function deleteJobCategory(id: string) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);

  // Safety check — don't delete if appointments reference it
  const inUse = await prisma.appointment.count({ where: { jobCategoryId: id } });
  if (inUse > 0) {
    throw new Error(
      `This category is used by ${inUse} appointment(s) and cannot be deleted.`
    );
  }
  await prisma.jobCategory.delete({ where: { id } });
  revalidatePath("/inventory");
  revalidatePath("/appointments");
}
