"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Loader2 } from "lucide-react";
import { createUser, updateUser } from "@/lib/actions/users";
import type { Role } from "@/generated/prisma/client";

interface Branch { id: string; name: string }
interface UserRow {
  id: string; name: string; email: string; role: Role;
  branchId: string | null; phone: string | null;
}

const ROLES: Role[] = ["SUPERVISOR", "MANAGER", "ADMIN", "TECHNICIAN"];

// A TECHNICIAN account is a shared team device, so it's labelled "Team" in the UI.
const ROLE_LABEL: Record<Role, string> = {
  SUPERVISOR: "Supervisor",
  MANAGER: "Manager",
  ADMIN: "Admin",
  TECHNICIAN: "Team",
};

interface Props {
  open: boolean; onClose: () => void;
  branches: Branch[]; editing?: UserRow | null;
  isSupervisor: boolean;
}

export function UserModal({ open, onClose, branches, editing, isSupervisor }: Props) {
  const isEdit = !!editing;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("TECHNICIAN");
  const [branchId, setBranchId] = useState<string>("");
  const [phone, setPhone] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect -- reset local draft fields when the modal target changes */
  useEffect(() => {
    if (editing) {
      setName(editing.name); setEmail(editing.email); setRole(editing.role);
      setBranchId(editing.branchId ?? ""); setPhone(editing.phone ?? ""); setPassword("");
    } else {
      setName(""); setEmail(""); setPassword(""); setRole("TECHNICIAN"); setBranchId(""); setPhone("");
    }
    setError("");
  }, [editing, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;
  // Managers/Admins only manage their own branch, so the branch is auto-assigned
  // server-side and the field is hidden — only a Supervisor picks a branch.
  const needsBranch = role !== "SUPERVISOR";
  const showBranch = isSupervisor && needsBranch;
  const roleOptions = isSupervisor ? ROLES : ROLES.filter((r) => r !== "SUPERVISOR");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    // For non-supervisor actors the server forces their own branch.
    const branchPayload = isSupervisor ? (needsBranch ? branchId || null : null) : null;
    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateUser(editing.id, { name, role, branchId: branchPayload, phone: phone || undefined, password: password || undefined });
        } else {
          await createUser({ name, email, password, role, branchId: branchPayload, phone: phone || undefined });
        }
        onClose();
      } catch (err: unknown) { setError(err instanceof Error ? err.message : "An error occurred."); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? "Edit User" : "Add New User"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required={!isEdit} readOnly={isEdit}
              className={`w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isEdit ? "bg-gray-50 text-gray-500" : ""}`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {isEdit && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>}
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required={!isEdit} placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as Role)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          {showBranch && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select branch —</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="01x-xxxxxxxx"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#28a89d] hover:bg-[#1f8c82] disabled:bg-[#28a89d]/50 text-white text-sm font-medium transition">
              {pending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : isEdit ? "Update" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
