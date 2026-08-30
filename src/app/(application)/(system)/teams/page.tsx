import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTeams, getBranchTechnicians } from "@/lib/actions/teams";
import { getTechnicians } from "@/lib/actions/technicians";
import { getBranches } from "@/lib/actions/users";
import { TeamsTechniciansClient } from "@/components/teams/TeamsTechniciansClient";

export default async function TeamsTechniciansPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user.role;
  if (role === "TECHNICIAN") redirect("/tasks");

  const isSupervisor = role === "SUPERVISOR";

  const [rawTeams, teamTechnicians, technicians, rawBranches] = await Promise.all([
    getTeams(),
    getBranchTechnicians(),
    getTechnicians(),
    isSupervisor ? getBranches() : Promise.resolve([]),
  ]);

  const teams = rawTeams.map((t) => ({
    id: t.id,
    name: t.name,
    branchId: t.branchId,
    branch: t.branch,
    members: t.members,
    _count: t._count,
  }));

  return (
    <TeamsTechniciansClient
      teams={teams}
      teamTechnicians={teamTechnicians}
      technicians={technicians}
      branches={rawBranches}
      isSupervisor={isSupervisor}
      userBranchId={session!.user.branchId}
    />
  );
}
