"use client";

import { useState, useTransition } from "react";
import { Building2, PlusCircle, Pencil, Check, X, Loader2 } from "lucide-react";
import { createBranch, updateBranch } from "@/lib/actions/branches";

interface BranchRow {
  id: string; name: string; address: string;
  _count: { users: number; customers: number; appointments: number };
}

export function BranchesClient({ branches }: { branches: BranchRow[] }) {
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddr, setEditAddr] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddr, setNewAddr] = useState("");
  const [error, setError] = useState("");

  function submitAdd() {
    setError("");
    startTransition(async () => {
      try { await createBranch({ name: newName, address: newAddr }); setAdding(false); setNewName(""); setNewAddr(""); }
      catch (e: unknown) { setError(e instanceof Error ? e.message : "An error occurred."); }
    });
  }

  function submitEdit(id: string) {
    setError("");
    startTransition(async () => {
      try { await updateBranch(id, { name: editName, address: editAddr }); setEditingId(null); }
      catch (e: unknown) { setError(e instanceof Error ? e.message : "An error occurred."); }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Branches</h1>
          <p className="text-sm text-gray-500 mt-0.5">{branches.length} registered branches</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-[#28a89d] hover:bg-[#1f8c82] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition">
            <PlusCircle className="w-4 h-4" /> Add Branch
          </button>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Add card */}
        {adding && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5">
            <h3 className="font-semibold text-blue-900 mb-3">New Branch</h3>
            <div className="space-y-3">
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Branch name" className="w-full px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea value={newAddr} onChange={e => setNewAddr(e.target.value)}
                placeholder="Address" rows={2} className="w-full px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <div className="flex gap-2">
                <button onClick={submitAdd} disabled={pending || !newName.trim() || !newAddr.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#28a89d] hover:bg-[#1f8c82] text-white text-sm py-2 rounded-lg disabled:opacity-40 transition">
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
                </button>
                <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {branches.map(b => (
          <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-5">
            {editingId === b.id ? (
              <div className="space-y-3">
                <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <textarea value={editAddr} onChange={e => setEditAddr(e.target.value)}
                  rows={2} className="w-full px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => submitEdit(b.id)} disabled={pending}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#28a89d] text-white text-sm py-2 rounded-lg disabled:opacity-40 transition">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
                    <h3 className="font-semibold text-gray-900">{b.name}</h3>
                  </div>
                  <button onClick={() => { setEditingId(b.id); setEditName(b.name); setEditAddr(b.address); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">{b.address}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Users", val: b._count.users },
                    { label: "Customers", val: b._count.customers },
                    { label: "Appointments", val: b._count.appointments },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-gray-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-blue-600">{val}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
