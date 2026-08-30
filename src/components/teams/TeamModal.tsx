"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import { createTeam, updateTeam } from "@/lib/actions/teams";

interface Branch { id: string; name: string }
interface TechnicianOpt { id: string; name: string; branchId: string | null; position: string | null; teams: { id: string; name: string }[] }
interface TeamRow { id: string; name: string; branchId: string; members: { id: string; name: string }[] }

interface Props {
  open: boolean;
  onClose: () => void;
  branches: Branch[];
  technicians: TechnicianOpt[];
  teams: TeamRow[];
  editing?: TeamRow | null;
  isSupervisor: boolean;
  defaultBranchId?: string;
}

export function TeamModal({ open, onClose, branches, technicians, teams, editing, isSupervisor, defaultBranchId }: Props) {
  const isEdit = !!editing;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  const [rows, setRows] = useState<string[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect -- reset local draft fields when the modal target changes */
  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setBranchId(editing.branchId);
      setRows(editing.members.map((m) => m.id));
    } else {
      setName("");
      setBranchId(defaultBranchId ?? "");
      setRows([]);
    }
    setError("");
  }, [editing, open, defaultBranchId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const branchTechnicians = technicians.filter((t) => t.branchId === branchId);
  const usedNames = new Set(
    teams.filter((t) => t.branchId === branchId && t.id !== editing?.id).map((t) => t.name)
  );
  const nameOptions = [...new Set(branchTechnicians.map((t) => t.name))].filter((n) => !usedNames.has(n));
  if (editing?.name && !nameOptions.includes(editing.name)) nameOptions.unshift(editing.name);

  function addRow() { setRows((prev) => [...prev, ""]); }
  function setRow(i: number, val: string) { setRows((prev) => prev.map((r, idx) => (idx === i ? val : r))); }
  function removeRow(i: number) { setRows((prev) => prev.filter((_, idx) => idx !== i)); }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Team name is required."); return; }
    if (isSupervisor && !branchId) { setError("Branch is required."); return; }
    const memberIds = [...new Set(rows.filter(Boolean))];
    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateTeam(editing.id, { name, memberIds });
        } else {
          await createTeam({ name, branchId, memberIds });
        }
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? "Edit Team" : "Add Team"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
            <select
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select team name --</option>
              {nameOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {isSupervisor && !isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select
                value={branchId}
                onChange={(e) => { setBranchId(e.target.value); setRows([]); }}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select branch --</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Technicians</label>
              {branchId && branchTechnicians.length > 0 && (
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Technician
                </button>
              )}
            </div>

            {!branchId ? (
              <p className="text-sm text-gray-400 italic">Select a branch first.</p>
            ) : branchTechnicians.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No technician registered under this branch.</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Click &quot;Add Technician&quot; to add members.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((rowId, i) => {
                  const takenElsewhere = new Set(rows.filter((_, idx) => idx !== i).filter(Boolean));
                  const options = branchTechnicians.filter((t) => !takenElsewhere.has(t.id));
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={rowId}
                        onChange={(e) => setRow(i, e.target.value)}
                        className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Select technician --</option>
                        {options.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} ({t.position ?? "Technician"})</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#28a89d] hover:bg-[#1f8c82] disabled:bg-[#28a89d]/50 text-white text-sm font-medium transition"
            >
              {pending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : isEdit ? "Update" : "Add Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
