"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { UserPlus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useBranchScope } from "@/components/layout/BranchScopeProvider";
import { DesktopTable, EmptyList, MobileCardList, RecordCard, RecordMeta, ResponsiveListShell } from "@/components/ui/ResponsiveList";
import { usePagination, Pagination } from "@/components/ui/Pagination";
import { deleteTechnician } from "@/lib/actions/technicians";
import { TechnicianModal } from "./TechnicianModal";

interface Branch { id: string; name: string }
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
  technicians: Technician[];
  branches: Branch[];
  isSupervisor: boolean;
  userBranchId: string | null;
  headerLeft?: ReactNode;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: "Available", color: "bg-green-100 text-green-700" },
  WORKING: { label: "Working", color: "bg-blue-100 text-blue-700" },
  IN_PROGRESS: { label: "In Progress", color: "bg-amber-100 text-amber-700" },
  ON_LEAVE: { label: "On Leave", color: "bg-gray-100 text-gray-600" },
};

export function TechniciansClient({ technicians, branches, isSupervisor, userBranchId, headerLeft }: Props) {
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const { selectedBranchId } = useBranchScope();
  const branchFilterId = isSupervisor ? selectedBranchId : "ALL";

  const filtered = technicians
    .filter((t) => branchFilterId === "ALL" || t.branchId === branchFilterId)
    .sort((a, b) => b.staffNo - a.staffNo); // newest first
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filtered, 10);

  function handleDelete(t: Technician) {
    if (!confirm(`Delete technician "${t.name}"?`)) return;
    setDeletingId(t.id);
    startTransition(async () => {
      try { await deleteTechnician(t.id); }
      catch (e: unknown) { alert(e instanceof Error ? e.message : "An error occurred."); }
      finally { setDeletingId(null); }
    });
  }

  const actions = (t: Technician, mobile = false) => (
    <div className={`flex items-center justify-end ${mobile ? "gap-2" : "gap-1"}`}>
      <button onClick={() => { setEditing(t); setModal(true); }}
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition`}>
        <Pencil className="w-4 h-4" />
      </button>
      <button onClick={() => handleDelete(t)} disabled={pending && deletingId === t.id}
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30`}>
        {pending && deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        {headerLeft ?? (
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Technicians</h1>
            <p className="text-sm text-gray-500 mt-0.5">{filtered.length} technicians</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {(!isSupervisor || branchFilterId !== "ALL") && (
            <button onClick={() => { setEditing(null); setModal(true); }}
              className="flex shrink-0 items-center gap-2 bg-[#151513] hover:bg-[#26251f] text-white text-sm font-medium px-4 py-2 rounded-xl transition">
              <UserPlus className="w-4 h-4" /> Add
            </button>
          )}
        </div>
      </div>

      <ResponsiveListShell>
        <DesktopTable>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3">Technician</th>
                <th className="px-4 py-3 w-36">Phone</th>
                <th className="px-4 py-3 w-36 hidden xl:table-cell">IC / ID</th>
                <th className="px-4 py-3 w-28 text-center">Jobs</th>
                <th className="px-4 py-3 w-36">Status</th>
                <th className="px-4 py-3 w-48 hidden lg:table-cell">Group</th>
                {isSupervisor && <th className="px-4 py-3 w-36 hidden xl:table-cell">Branch</th>}
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((t, i) => {
                const cfg = STATUS_CONFIG[(t.technicianStatus ?? "AVAILABLE")] ?? STATUS_CONFIG.AVAILABLE;
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-xs font-medium text-blue-700">TC-{String(t.staffNo).padStart(2, "0")}</span>
                        <span className="truncate font-medium text-gray-900">{t.name}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400 truncate">
                        {t.position || "No role"}{isSupervisor && t.branch?.name ? ` / ${t.branch.name}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 truncate">{t.phone || <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3 text-gray-600 truncate hidden xl:table-cell">{t.identificationNo || <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3 text-center font-medium text-gray-800">{t.completedJobs}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {t.teams.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.teams.map((g) => (
                            <span key={g.id} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{g.name}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    {isSupervisor && <td className="px-4 py-3 text-gray-500 truncate hidden xl:table-cell">{t.branch?.name ?? "-"}</td>}
                    <td className="px-4 py-3">{actions(t)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={isSupervisor ? 9 : 8} className="px-4 py-10 text-center text-gray-400">No technicians found.</td></tr>
              )}
            </tbody>
          </table>
        </DesktopTable>

        <MobileCardList>
          {pageItems.map((t) => {
            const cfg = STATUS_CONFIG[(t.technicianStatus ?? "AVAILABLE")] ?? STATUS_CONFIG.AVAILABLE;
            return (
              <RecordCard key={t.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-blue-700">TC-{String(t.staffNo).padStart(2, "0")}</p>
                    <h2 className="mt-1 font-semibold text-gray-900 break-words">{t.name}</h2>
                    <p className="text-sm text-gray-500">{t.position || "No role"}</p>
                  </div>
                  <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <RecordMeta label="Phone" value={t.phone || <span className="text-gray-300">-</span>} />
                  <RecordMeta label="Jobs" value={<span className="font-semibold text-gray-900">{t.completedJobs}</span>} />
                  <RecordMeta label="IC / ID" value={t.identificationNo || <span className="text-gray-300">-</span>} />
                  {isSupervisor && <RecordMeta label="Branch" value={t.branch?.name ?? <span className="text-gray-300">-</span>} />}
                  <RecordMeta label="Group" className="col-span-2" value={
                    t.teams.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {t.teams.map((g) => <span key={g.id} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{g.name}</span>)}
                      </span>
                    ) : <span className="text-gray-300">-</span>
                  } />
                </div>
                <div className="mt-4 border-t border-gray-100 pt-3">{actions(t, true)}</div>
              </RecordCard>
            );
          })}
          {filtered.length === 0 && <EmptyList>No technicians found.</EmptyList>}
        </MobileCardList>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </ResponsiveListShell>

      <TechnicianModal open={modal} onClose={() => { setModal(false); setEditing(null); }}
        branches={branches} editing={editing} isSupervisor={isSupervisor}
        defaultBranchId={isSupervisor ? (branchFilterId !== "ALL" ? branchFilterId : undefined) : (userBranchId ?? undefined)} />
    </div>
  );
}
