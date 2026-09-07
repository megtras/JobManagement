"use client";

import { useState } from "react";
import { TeamsClient } from "@/components/teams/TeamsClient";
import { TechniciansClient } from "@/components/technicians/TechniciansClient";

interface Branch { id: string; name: string }
interface TechnicianOpt { id: string; name: string; branchId: string | null; position: string | null; teams: { id: string; name: string }[] }
interface TeamRow {
  id: string; name: string; branchId: string;
  branch: { id: string; name: string };
  members: { id: string; name: string }[];
  _count: { appointments: number };
}
interface Technician {
  id: string; staffNo: number; name: string; phone: string | null;
  position: string | null; identificationNo: string | null;
  technicianStatus: string | null;
  branchId: string | null;
  branch: { name: string } | null;
  teams: { id: string; name: string }[];
  completedJobs: number;
}

interface Props {
  teams: TeamRow[];
  teamTechnicians: TechnicianOpt[];
  technicians: Technician[];
  branches: Branch[];
  isSupervisor: boolean;
  userBranchId: string | null;
}

const TABS = [
  { value: "teams", label: "Teams" },
  { value: "technicians", label: "Technicians" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export function TeamsTechniciansClient({ teams, teamTechnicians, technicians, branches, isSupervisor, userBranchId }: Props) {
  const [tab, setTab] = useState<Tab>("teams");

  // Page title + tab switcher — rendered in place of each child's own title.
  const header = (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Teams &amp; Technicians</h1>
      <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm w-fit mt-3">
        {TABS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              tab === t.value ? "bg-[#151513] text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );

  return tab === "teams" ? (
    <TeamsClient teams={teams} branches={branches} technicians={teamTechnicians}
      isSupervisor={isSupervisor} userBranchId={userBranchId} headerLeft={header} />
  ) : (
    <TechniciansClient technicians={technicians} branches={branches}
      isSupervisor={isSupervisor} userBranchId={userBranchId} headerLeft={header} />
  );
}
