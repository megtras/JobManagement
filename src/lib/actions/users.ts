"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Role } from "@/generated/prisma/client";

/** Any non-technician staff member (Supervisor / Manager / Admin). */
async function getStaffSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "TECHNICIAN") throw new Error("Unauthorized");
  return session;
}

export async function getUsers() {
  const session = await getStaffSession();
  const { role, branchId } = session.user;
  return prisma.user.findMany({
    // Supervisor sees every branch; Manager/Admin only their own.
    where: role === "SUPERVISOR" ? {} : { branchId },
    orderBy: { createdAt: "desc" },
    include: { branch: { select: { id: true, name: true } } },
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: Role;
  branchId: string | null;
  phone?: string;
}) {
  const session = await getStaffSession();
  const { role: actorRole, branchId: actorBranch } = session.user;

  // Validate
  if (!data.name.trim() || !data.email.trim() || !data.password) {
    throw new Error("Name, email, and password are required.");
  }
  if (data.password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  // Only a supervisor can create cross-branch supervisors; others are pinned
  // to their own branch.
  let targetBranch = data.branchId;
  if (actorRole !== "SUPERVISOR") {
    if (data.role === "SUPERVISOR") throw new Error("Only a supervisor can create a supervisor account.");
    targetBranch = actorBranch;
  }
  if (data.role !== "SUPERVISOR" && !targetBranch) {
    throw new Error("A branch is required for this role.");
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new Error("This email address is already in use.");

  const passwordHash = await bcrypt.hash(data.password, 12);

  await prisma.user.create({
    data: {
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash,
      role: data.role,
      branchId: data.role === "SUPERVISOR" ? null : targetBranch,
      phone: data.phone?.trim() || null,
      technicianStatus: data.role === "TECHNICIAN" ? "AVAILABLE" : null,
    },
  });

  revalidatePath("/users");
}

export async function updateUser(
  id: string,
  data: {
    name: string;
    role: Role;
    branchId: string | null;
    phone?: string;
    password?: string;
  }
) {
  const session = await getStaffSession();
  const { role: actorRole, branchId: actorBranch } = session.user;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("User not found.");

  let targetBranch = data.branchId;
  if (actorRole !== "SUPERVISOR") {
    // Manager/Admin: only manage users inside their own branch, and never
    // touch (or promote to) supervisors.
    if (existing.branchId !== actorBranch) throw new Error("Unauthorized");
    if (data.role === "SUPERVISOR" || existing.role === "SUPERVISOR") {
      throw new Error("Only a supervisor can manage supervisor accounts.");
    }
    targetBranch = actorBranch;
  }
  if (data.role !== "SUPERVISOR" && !targetBranch) {
    throw new Error("A branch is required for this role.");
  }

  const updateData: Record<string, unknown> = {
    name: data.name.trim(),
    role: data.role,
    branchId: data.role === "SUPERVISOR" ? null : targetBranch,
    phone: data.phone?.trim() || null,
    technicianStatus: data.role === "TECHNICIAN" ? "AVAILABLE" : null,
  };

  if (data.password && data.password.length >= 8) {
    updateData.passwordHash = await bcrypt.hash(data.password, 12);
  }

  await prisma.user.update({ where: { id }, data: updateData });
  revalidatePath("/users");
}

export async function deleteUser(id: string) {
  const session = await getStaffSession();
  const { id: selfId, role: actorRole, branchId: actorBranch } = session.user;
  if (selfId === id) throw new Error("You cannot delete your own account.");

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new Error("User not found.");
  if (actorRole !== "SUPERVISOR") {
    if (target.branchId !== actorBranch || target.role === "SUPERVISOR") {
      throw new Error("Unauthorized");
    }
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/users");
}

export async function getBranches() {
  await getStaffSession();
  return prisma.branch.findMany({ orderBy: { name: "asc" } });
}
