import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type TeamTrackingPoint = {
  id: string;
  name: string;
  accountName: string;
  role: Exclude<Role, "SUPERVISOR">;
  branchId: string;
  branchName: string;
  teamIds: string[];
  teamNames: string[];
  lat: number | null;
  lng: number | null;
  area: string | null;
  address: string | null;
  updatedAt: string | null;
  memberName: string | null;
  trackedMembers: number;
};

export async function getTeamTracking(role: Role, branchId: string | null): Promise<TeamTrackingPoint[]> {
  const isSupervisor = role === "SUPERVISOR";
  const users = await prisma.user.findMany({
    where: {
      role: isSupervisor ? { not: "SUPERVISOR" } : "TECHNICIAN",
      ...(role !== "SUPERVISOR" && branchId ? { branchId } : {}),
    },
    select: {
      id: true,
      name: true,
      role: true,
      branchId: true,
      lastLocationLat: true,
      lastLocationLng: true,
      lastLocationArea: true,
      lastLocationAddress: true,
      lastLocationAt: true,
      branch: { select: { name: true } },
      teams: { select: { id: true, name: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return users.map((user) => ({
    id: user.id,
    name: user.role === "TECHNICIAN" && user.teams.length > 0 ? user.teams.map((team) => team.name).join(", ") : user.name,
    accountName: user.name,
    role: user.role as Exclude<Role, "SUPERVISOR">,
    branchId: user.branchId ?? "",
    branchName: user.branch?.name ?? "No branch",
    teamIds: user.teams.map((team) => team.id),
    teamNames: user.teams.map((team) => team.name),
    lat: user.lastLocationLat,
    lng: user.lastLocationLng,
    area: user.lastLocationArea,
    address: user.lastLocationAddress,
    updatedAt: user.lastLocationAt ? user.lastLocationAt.toISOString() : null,
    memberName: user.name,
    trackedMembers: user.lastLocationLat != null && user.lastLocationLng != null && user.lastLocationAt ? 1 : 0,
  }));
}
