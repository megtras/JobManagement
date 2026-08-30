"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function assertStaff(role: string | undefined) {
  if (!role || role === "TECHNICIAN") throw new Error("Unauthorized");
}

export async function getAllBranches() {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);
  return prisma.branch.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true, customers: true, appointments: true } },
    },
  });
}

export async function createBranch(data: { name: string; address: string }) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);
  if (!data.name.trim()) throw new Error("Branch name is required.");
  if (!data.address.trim()) throw new Error("Branch address is required.");
  await prisma.branch.create({ data: { name: data.name.trim(), address: data.address.trim() } });
  revalidatePath("/branches");
}

export async function updateBranch(id: string, data: { name: string; address: string }) {
  const session = await getServerSession(authOptions);
  assertStaff(session?.user?.role);
  await prisma.branch.update({ where: { id }, data: { name: data.name.trim(), address: data.address.trim() } });
  revalidatePath("/branches");
}
