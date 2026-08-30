"use client";

import { useState, useTransition } from "react";
import { UserPlus, Pencil, Trash2, Loader2 } from "lucide-react";
import { UserModal } from "./UserModal";
import { useBranchScope } from "@/components/layout/BranchScopeProvider";
import { DesktopTable, EmptyList, MobileCardList, RecordCard, RecordMeta, ResponsiveListShell } from "@/components/ui/ResponsiveList";
import { usePagination, Pagination } from "@/components/ui/Pagination";
import { deleteUser } from "@/lib/actions/users";
import type { Role } from "@/generated/prisma/client";

interface Branch { id: string; name: string }
interface UserRow {
  id: string; name: string; email: string; role: Role;
  branchId: string | null; phone: string | null;
  branch: { id: string; name: string } | null;
}

const ROLE_COLOR: Record<Role, string> = {
  SUPERVISOR: "bg-purple-100 text-purple-700",
  MANAGER: "bg-blue-100 text-blue-700",
  ADMIN: "bg-amber-100 text-amber-700",
  TECHNICIAN: "bg-green-100 text-green-700",
};

const ROLE_FILTERS: Array<{ value: "ALL" | Role; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "MANAGER", label: "Manager" },
  { value: "ADMIN", label: "Admin" },
  { value: "TECHNICIAN", label: "Team" },
];

// A TECHNICIAN account is a shared team device, so it's labelled "Team" in the UI.
const ROLE_LABEL: Record<Role, string> = {
  SUPERVISOR: "Supervisor",
  MANAGER: "Manager",
  ADMIN: "Admin",
  TECHNICIAN: "Team",
};

interface Props {
  users: UserRow[]; branches: Branch[]; currentUserId: string; isSupervisor: boolean;
}

function roleLabel(role: Role) {
  return ROLE_LABEL[role] ?? role;
}

export function UsersClient({ users, branches, currentUserId, isSupervisor }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"ALL" | Role>("ALL");
  const [pending, startTransition] = useTransition();
  const { selectedBranchId } = useBranchScope();
  const branchFilterId = isSupervisor ? selectedBranchId : "ALL";

  const filtered = users
    .filter((u) => roleFilter === "ALL" || u.role === roleFilter)
    .filter((u) => !isSupervisor || branchFilterId === "ALL" || u.branchId === branchFilterId);
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filtered, 10);

  function handleDelete(u: UserRow) {
    if (u.id === currentUserId) return;
    if (!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    setDeletingId(u.id);
    startTransition(async () => {
      try { await deleteUser(u.id); }
      catch (e: unknown) { alert(e instanceof Error ? e.message : "An error occurred."); }
      finally { setDeletingId(null); }
    });
  }

  const actions = (u: UserRow, mobile = false) => (
    <div className={`flex items-center justify-end ${mobile ? "gap-2" : "gap-1"}`}>
      <button onClick={() => { setEditing(u); setModalOpen(true); }}
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition`}>
        <Pencil className="w-4 h-4" />
      </button>
      <button onClick={() => handleDelete(u)}
        disabled={u.id === currentUserId || (pending && deletingId === u.id)}
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed`}>
        {pending && deletingId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {users.length} registered users</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <div className="flex max-w-full rounded-lg border border-gray-200 bg-white overflow-x-auto text-sm">
              {ROLE_FILTERS.map((r) => (
                <button key={r.value} onClick={() => setRoleFilter(r.value)}
                  className={`shrink-0 px-3 py-1.5 font-medium transition ${roleFilter === r.value ? "bg-[#28a89d] text-white" : "text-gray-600 hover:bg-gray-50"} ${r.value !== "ALL" ? "border-l border-gray-200" : ""}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
          className="flex shrink-0 items-center justify-center gap-2 bg-[#28a89d] hover:bg-[#1f8c82] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition">
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      <ResponsiveListShell>
        <DesktopTable>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3 w-56 hidden lg:table-cell">Email</th>
                <th className="px-4 py-3 w-32">Role</th>
                {isSupervisor && <th className="px-4 py-3 w-36 hidden xl:table-cell">Branch</th>}
                <th className="px-4 py-3 w-36">Phone</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((u, i) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 truncate">{u.name}{u.id === currentUserId && <span className="ml-2 text-xs text-gray-400">(you)</span>}</div>
                    <div className="text-xs text-gray-400 truncate lg:hidden">{u.email}</div>
                    {isSupervisor && <div className="text-xs text-gray-400 truncate xl:hidden">{u.branch?.name ?? "No branch"}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate hidden lg:table-cell">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLOR[u.role]}`}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  {isSupervisor && <td className="px-4 py-3 text-gray-600 truncate hidden xl:table-cell">{u.branch?.name ?? <span className="text-gray-400">-</span>}</td>}
                  <td className="px-4 py-3 text-gray-600 truncate">{u.phone ?? <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-3">{actions(u)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={isSupervisor ? 7 : 6} className="px-4 py-8 text-center text-gray-400">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </DesktopTable>

        <MobileCardList>
          {pageItems.map((u) => (
            <RecordCard key={u.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 break-words">{u.name}{u.id === currentUserId && <span className="ml-2 text-xs font-normal text-gray-400">(you)</span>}</h2>
                  <p className="text-sm text-gray-500 break-words">{u.email}</p>
                </div>
                <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLOR[u.role]}`}>
                  {roleLabel(u.role)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <RecordMeta label="Phone" value={u.phone ?? <span className="text-gray-300">-</span>} />
                {isSupervisor && <RecordMeta label="Branch" value={u.branch?.name ?? <span className="text-gray-300">-</span>} />}
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">{actions(u, true)}</div>
            </RecordCard>
          ))}
          {filtered.length === 0 && <EmptyList>No users found.</EmptyList>}
        </MobileCardList>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </ResponsiveListShell>

      <UserModal open={modalOpen} onClose={() => setModalOpen(false)} branches={branches} editing={editing} isSupervisor={isSupervisor} />
    </>
  );
}
