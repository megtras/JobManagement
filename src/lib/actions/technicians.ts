"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma/client";

async function getStaffSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "TECHNICIAN") throw new Error("Unauthorized");
  return session;
}

function branchWhere(role: Role, userBranchId: string | null, filterBranchId?: string) {
  if (role === "SUPERVISOR") return filterBranchId ? { branchId: filterBranchId } : {};
  return { branchId: userBranchId! };
}

export async function getTechnicians(filterBranchId?: string) {
  const session = await getStaffSession();
  const { role, branchId } = session.user;
  const where = branchWhere(role, branchId, filterBranchId);

  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN", ...where },
    select: {
      id: true, staffNo: true, name: true, phone: true, position: true,
      identificationNo: true, technicianStatus: true, branchId: true,
      branch: { select: { name: true } },
      teams: { select: { id: true, name: true } },
    },
    orderBy: [{ branch: { name: "asc" } }, { staffNo: "asc" }],
  });

  // Completed jobs = DONE appointments where the technician is on an assigned team.
  const doneAppts = await prisma.appointment.findMany({
    where: { status: "DONE", ...where },
    select: { teams: { select: { members: { select: { id: true } } } } },
  });
  const completed: Record<string, number> = {};
  for (const a of doneAppts) {
    const ids = new Set(a.teams.flatMap((t) => t.members.map((m) => m.id)));
    for (const id of ids) completed[id] = (completed[id] ?? 0) + 1;
  }

  return technicians.map((t) => ({ ...t, completedJobs: completed[t.id] ?? 0 }));
}

function resolveBranch(role: Role, userBranchId: string | null, dataBranchId?: string) {
  const target = role === "SUPERVISOR" ? dataBranchId : userBranchId;
  if (!target) throw new Error("Branch is required.");
  return target;
}

export async function createTechnician(data: {
  name: string; phone?: string;
  position?: string; identificationNo?: string; branchId?: string;
}) {
  const session = await getStaffSession();
  const { role, branchId } = session.user;

  if (!data.name.trim()) throw new Error("Name is required.");

  const targetBranch = resolveBranch(role, branchId, data.branchId);

  // Technicians are roster records without login for now. The User row still
  // requires a unique email + password, so generate placeholder credentials.
  const email = `tech-${randomUUID()}@genplusaircond.local`;
  const passwordHash = await bcrypt.hash(randomUUID(), 12);

  await prisma.user.create({
    data: {
      name: data.name.trim(),
      email,
      passwordHash,
      role: "TECHNICIAN",
      phone: data.phone?.trim() || null,
      position: data.position?.trim() || null,
      identificationNo: data.identificationNo?.trim() || null,
      branchId: targetBranch,
      technicianStatus: "AVAILABLE",
    },
  });
  revalidatePath("/technicians");
}

export async function updateTechnician(
  id: string,
  data: {
    name: string; phone?: string; position?: string; identificationNo?: string;
    branchId?: string;
  }
) {
  const session = await getStaffSession();
  const { role, branchId } = session.user;

  const tech = await prisma.user.findUnique({ where: { id } });
  if (!tech || tech.role !== "TECHNICIAN") throw new Error("Technician not found.");
  if (role !== "SUPERVISOR" && tech.branchId !== branchId) throw new Error("Unauthorized");

  const targetBranch = role === "SUPERVISOR" ? (data.branchId ?? tech.branchId) : branchId;

  // technicianStatus is left untouched so editing does not reset a technician's status.
  await prisma.user.update({
    where: { id },
    data: {
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      position: data.position?.trim() || null,
      identificationNo: data.identificationNo?.trim() || null,
      branchId: targetBranch,
    },
  });
  revalidatePath("/technicians");
}

export async function deleteTechnician(id: string) {
  const session = await getStaffSession();
  const { role, branchId } = session.user;

  const tech = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { checkIns: true } } },
  });
  if (!tech || tech.role !== "TECHNICIAN") throw new Error("Technician not found.");
  if (role !== "SUPERVISOR" && tech.branchId !== branchId) throw new Error("Unauthorized");
  if (tech._count.checkIns > 0) {
    throw new Error("This technician has work check-in records and cannot be deleted.");
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/technicians");
}
