"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { UsersRound, Pencil, Trash2, Loader2, Plus } from "lucide-react";
import { deleteTeam } from "@/lib/actions/teams";
import { TeamModal } from "./TeamModal";
import { useBranchScope } from "@/components/layout/BranchScopeProvider";
import { DesktopTable, EmptyList, MobileCardList, RecordCard, RecordMeta, ResponsiveListShell } from "@/components/ui/ResponsiveList";
import { usePagination, Pagination } from "@/components/ui/Pagination";

interface Branch { id: string; name: string }
interface TechnicianOpt { id: string; name: string; branchId: string | null; position: string | null; teams: { id: string; name: string }[] }
interface TeamRow {
  id: string; name: string; branchId: string;
  branch: { id: string; name: string };
  members: { id: string; name: string }[];
  _count: { appointments: number };
}

interface Props {
  teams: TeamRow[];
  branches: Branch[];
  technicians: TechnicianOpt[];
  isSupervisor: boolean;
  userBranchId: string | null;
  headerLeft?: ReactNode;
}

export function TeamsClient({ teams, branches, technicians, isSupervisor, userBranchId, headerLeft }: Props) {
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const { selectedBranchId } = useBranchScope();
  const branchFilterId = isSupervisor ? selectedBranchId : "ALL";

  const filtered = teams.filter((t) => branchFilterId === "ALL" || t.branchId === branchFilterId);
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filtered, 10);

  function handleDelete(t: TeamRow) {
    if (t._count.appointments > 0) {
      alert(`This team has ${t._count.appointments} appointment(s) and cannot be deleted.`);
      return;
    }
    if (!confirm(`Delete team "${t.name}"?`)) return;
    setDeletingId(t.id);
    startTransition(async () => {
      try { await deleteTeam(t.id); }
      catch (e: unknown) { alert(e instanceof Error ? e.message : "An error occurred."); }
      finally { setDeletingId(null); }
    });
  }

  const memberChips = (t: TeamRow) => (
    t.members.length > 0 ? (
      <span className="flex flex-wrap gap-1">
        {t.members.map((m) => (
          <span key={m.id} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{m.name}</span>
        ))}
      </span>
    ) : <span className="text-gray-300">No technicians</span>
  );

  const actions = (t: TeamRow, mobile = false) => (
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
    <>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        {headerLeft ?? (
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
            <p className="text-sm text-gray-500 mt-0.5">{teams.length} teams</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {(!isSupervisor || branchFilterId !== "ALL") && (
            <button onClick={() => { setEditing(null); setModal(true); }}
              className="flex shrink-0 items-center gap-2 bg-[#151513] hover:bg-[#26251f] text-white text-sm font-medium px-4 py-2 rounded-xl transition">
              <Plus className="w-4 h-4" /> Add
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
                <th className="px-4 py-3">Team</th>
                {isSupervisor && <th className="px-4 py-3 w-36 hidden lg:table-cell">Branch</th>}
                <th className="px-4 py-3">Technicians</th>
                <th className="px-4 py-3 w-28 text-center">Appts</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((t, i) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex min-w-0 items-center gap-2 font-medium text-gray-900">
                      <UsersRound className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </span>
                    {isSupervisor && <div className="text-xs text-gray-400 truncate lg:hidden">{t.branch.name}</div>}
                  </td>
                  {isSupervisor && <td className="px-4 py-3 text-gray-500 truncate hidden lg:table-cell">{t.branch.name}</td>}
                  <td className="px-4 py-3">{memberChips(t)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{t._count.appointments}</td>
                  <td className="px-4 py-3">{actions(t)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={isSupervisor ? 6 : 5} className="px-4 py-10 text-center text-gray-400">No teams found.</td></tr>
              )}
            </tbody>
          </table>
        </DesktopTable>

        <MobileCardList>
          {pageItems.map((t) => (
            <RecordCard key={t.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <UsersRound className="w-5 h-5 text-blue-600 shrink-0" />
                  <h2 className="font-semibold text-gray-900 break-words">{t.name}</h2>
                </div>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                  {t._count.appointments} appt
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {isSupervisor && <RecordMeta label="Branch" value={t.branch.name} />}
                <RecordMeta label="Appointments" value={t._count.appointments} />
                <RecordMeta label="Technicians" value={memberChips(t)} className="col-span-2" />
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">{actions(t, true)}</div>
            </RecordCard>
          ))}
          {filtered.length === 0 && <EmptyList>No teams found.</EmptyList>}
        </MobileCardList>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </ResponsiveListShell>

      <TeamModal open={modal} onClose={() => { setModal(false); setEditing(null); }}
        branches={branches} technicians={technicians} teams={teams} editing={editing}
        isSupervisor={isSupervisor}
        defaultBranchId={isSupervisor ? (branchFilterId !== "ALL" ? branchFilterId : undefined) : (userBranchId ?? undefined)} />
    </>
  );
}
