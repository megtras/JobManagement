"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Role } from "@/generated/prisma/client";

async function getSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

function assertStaff(role: Role) {
  if (role === "TECHNICIAN") throw new Error("Unauthorized");
}

function branchFilter(role: Role, userBranchId: string | null, filterBranchId?: string) {
  if (role === "SUPERVISOR") return filterBranchId ? { branchId: filterBranchId } : {};
  return { branchId: userBranchId! };
}

export async function getTeams(filterBranchId?: string) {
  const session = await getSession();
  const { role, branchId } = session.user;
  return prisma.team.findMany({
    where: branchFilter(role, branchId, filterBranchId),
    include: {
      branch: { select: { id: true, name: true } },
      members: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      _count: { select: { appointments: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Technicians available to staff a team, scoped to the actor's branch. */
export async function getBranchTechnicians(filterBranchId?: string) {
  const session = await getSession();
  const { role, branchId } = session.user;
  const targetBranch = role === "SUPERVISOR" ? filterBranchId : branchId;
  return prisma.user.findMany({
    where: { role: "TECHNICIAN", ...(targetBranch ? { branchId: targetBranch } : {}) },
    select: { id: true, name: true, branchId: true, position: true, teams: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
}

function resolveBranch(role: Role, userBranchId: string | null, dataBranchId?: string) {
  const targetBranch = role === "SUPERVISOR" ? dataBranchId : userBranchId;
  if (!targetBranch) throw new Error("Branch is required.");
  return targetBranch;
}

export async function createTeam(data: { name: string; branchId?: string; memberIds?: string[] }) {
  const session = await getSession();
  const { role, branchId } = session.user;
  assertStaff(role);

  const name = data.name.trim();
  if (!name) throw new Error("Team name is required.");
  const targetBranch = resolveBranch(role, branchId, data.branchId);
  const memberIds = data.memberIds ?? [];

  await prisma.team.create({
    data: {
      name,
      branchId: targetBranch,
      members: { connect: memberIds.map((id) => ({ id })) },
    },
  });
  revalidatePath("/teams");
}

export async function updateTeam(id: string, data: { name: string; memberIds?: string[] }) {
  const session = await getSession();
  const { role, branchId } = session.user;
  assertStaff(role);

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) throw new Error("Team not found.");
  if (role !== "SUPERVISOR" && team.branchId !== branchId) throw new Error("Unauthorized");

  const name = data.name.trim();
  if (!name) throw new Error("Team name is required.");
  const memberIds = data.memberIds ?? [];

  await prisma.team.update({
    where: { id },
    // `set` on the one-to-many membership replaces the roster: removed members get
    // their teamId cleared, new members get attached.
    data: { name, members: { set: memberIds.map((mid) => ({ id: mid })) } },
  });
  revalidatePath("/teams");
}

export async function deleteTeam(id: string) {
  const session = await getSession();
  const { role, branchId } = session.user;
  assertStaff(role);

  const team = await prisma.team.findUnique({
    where: { id },
    include: { _count: { select: { appointments: true } } },
  });
  if (!team) throw new Error("Team not found.");
  if (role !== "SUPERVISOR" && team.branchId !== branchId) throw new Error("Unauthorized");
  if (team._count.appointments > 0)
    throw new Error(`This team has ${team._count.appointments} appointment(s) and cannot be deleted.`);

  await prisma.team.delete({ where: { id } });
  revalidatePath("/teams");
}
