"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Loader2 } from "lucide-react";
import { createTechnician, updateTechnician } from "@/lib/actions/technicians";

interface Branch { id: string; name: string }
interface TechRow {
  id: string; name: string; phone: string | null;
  position: string | null; identificationNo: string | null;
  technicianStatus: string | null; branchId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  branches: Branch[];
  editing?: TechRow | null;
  isSupervisor: boolean;
  defaultBranchId?: string;
}

const POSITIONS = ["Team Lead", "Technician", "Part-Time"];

export function TechnicianModal({ open, onClose, branches, editing, isSupervisor, defaultBranchId }: Props) {
  const isEdit = !!editing;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("Technician");
  const [identificationNo, setIdentificationNo] = useState("");
  const [branchId, setBranchId] = useState(defaultBranchId ?? "");

  /* eslint-disable react-hooks/set-state-in-effect -- reset local draft fields when the modal target changes */
  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setPhone(editing.phone ?? "");
      setPosition(editing.position ?? "Technician");
      setIdentificationNo(editing.identificationNo ?? "");
      setBranchId(editing.branchId ?? "");
    } else {
      setName("");
      setPhone("");
      setPosition("Technician");
      setIdentificationNo("");
      setBranchId(defaultBranchId ?? "");
    }
    setError("");
  }, [editing, open, defaultBranchId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Name is required."); return; }
    if (isSupervisor && !branchId) { setError("Branch is required."); return; }
    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateTechnician(editing.id, {
            name, phone, position, identificationNo, branchId,
          });
        } else {
          await createTechnician({
            name, phone, position, identificationNo, branchId,
          });
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
          <h2 className="font-semibold text-gray-900">{isEdit ? "Edit Technician" : "Add Technician"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01x-xxxxxxxx"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Identification No.</label>
              <input
                value={identificationNo}
                onChange={(e) => setIdentificationNo(e.target.value)}
                placeholder="IC / passport"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {isSupervisor && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select branch --</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <p className="text-xs text-gray-400">Group assignment is managed in the Teams page.</p>
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
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#151513] hover:bg-[#26251f] disabled:bg-[#151513]/50 text-white text-sm font-medium transition"
            >
              {pending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : isEdit ? "Update" : "Add Technician"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
