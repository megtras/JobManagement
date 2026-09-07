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

// ─── Asset types + per (type x category) pricing ──────────────────────────────

// Read path for the appointment form: the type list plus every priced pair.
// Any authenticated user needs this to fill the asset rows.
export async function getAssetTypePricing() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const [assetTypes, prices] = await Promise.all([
    prisma.assetType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.assetTypePrice.findMany(),
  ]);

  return {
    assetTypes: assetTypes.map((t) => ({ id: t.id, name: t.name })),
    prices: prices.map((p) => ({
      assetTypeId: p.assetTypeId,
      jobCategoryId: p.jobCategoryId,
      price: parseFloat(p.price.toString()),
    })),
  };
}

export async function createAssetType(name: string) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);
  const clean = name.trim();
  if (!clean) throw new Error("Asset type name is required.");

  const existing = await prisma.assetType.findUnique({ where: { name: clean } });
  if (existing) throw new Error(`"${clean}" already exists.`);

  const last = await prisma.assetType.findFirst({ orderBy: { sortOrder: "desc" } });
  await prisma.assetType.create({
    data: { name: clean, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  revalidatePath("/inventory");
  revalidatePath("/appointments");
}

export async function updateAssetType(id: string, name: string) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);
  const clean = name.trim();
  if (!clean) throw new Error("Asset type name is required.");

  const clash = await prisma.assetType.findUnique({ where: { name: clean } });
  if (clash && clash.id !== id) throw new Error(`"${clean}" already exists.`);

  await prisma.assetType.update({ where: { id }, data: { name: clean } });
  revalidatePath("/inventory");
  revalidatePath("/appointments");
}

// Deleting a type only removes it from the dropdown and drops its price rows.
// Past appointments keep working because AppointmentAsset.acType stores the
// name as a snapshot rather than a foreign key.
export async function deleteAssetType(id: string) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);
  await prisma.assetType.delete({ where: { id } });
  revalidatePath("/inventory");
  revalidatePath("/appointments");
}

// Upsert one cell of the matrix. An empty/!finite price clears the cell, which
// makes the form fall back to the category's own price.
export async function setAssetTypePrice(
  assetTypeId: string,
  jobCategoryId: string,
  price: number | null
) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);

  if (price == null || !Number.isFinite(price)) {
    await prisma.assetTypePrice.deleteMany({ where: { assetTypeId, jobCategoryId } });
  } else {
    if (price < 0) throw new Error("Price cannot be negative.");
    await prisma.assetTypePrice.upsert({
      where: { assetTypeId_jobCategoryId: { assetTypeId, jobCategoryId } },
      create: { assetTypeId, jobCategoryId, price },
      update: { price },
    });
  }
  revalidatePath("/inventory");
  revalidatePath("/appointments");
}
