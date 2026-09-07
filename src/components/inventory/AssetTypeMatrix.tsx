"use client";

import { useState, useTransition } from "react";
import { PlusCircle, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import {
  createAssetType,
  updateAssetType,
  deleteAssetType,
  setAssetTypePrice,
} from "@/lib/actions/inventory";

interface AssetTypeRow { id: string; name: string; usageCount: number }
interface CategoryCol { id: string; name: string; price: number }
interface PriceCell { assetTypeId: string; jobCategoryId: string; price: number }

function cellKey(assetTypeId: string, jobCategoryId: string) {
  return `${assetTypeId}::${jobCategoryId}`;
}

export function AssetTypeMatrix({
  assetTypes,
  categories,
  prices,
}: {
  assetTypes: AssetTypeRow[];
  categories: CategoryCol[];
  prices: PriceCell[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Local mirror of the matrix so a cell shows the typed value immediately;
  // the server action runs on blur and only when the value actually changed.
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const p of prices) seed[cellKey(p.assetTypeId, p.jobCategoryId)] = String(p.price);
    return seed;
  });
  const [savingCell, setSavingCell] = useState<string | null>(null);

  function saveCell(assetTypeId: string, jobCategoryId: string, raw: string) {
    const key = cellKey(assetTypeId, jobCategoryId);
    const original = prices.find(
      (p) => p.assetTypeId === assetTypeId && p.jobCategoryId === jobCategoryId
    );
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next != null && !Number.isFinite(next)) return;
    if ((original?.price ?? null) === next) return;

    setError("");
    setSavingCell(key);
    startTransition(async () => {
      try {
        await setAssetTypePrice(assetTypeId, jobCategoryId, next);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not save price.");
      } finally {
        setSavingCell(null);
      }
    });
  }

  function submitAdd() {
    setError("");
    startTransition(async () => {
      try {
        await createAssetType(newName);
        setNewName("");
        setAdding(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not add asset type.");
      }
    });
  }

  function submitRename(id: string) {
    setError("");
    startTransition(async () => {
      try {
        await updateAssetType(id, editName);
        setEditingId(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not rename asset type.");
      }
    });
  }

  function handleDelete(row: AssetTypeRow) {
    const warning = row.usageCount > 0
      ? `"${row.name}" is recorded on ${row.usageCount} existing asset(s). Those records keep their type name; it is only removed from the dropdown and its prices are cleared.\n\nDelete anyway?`
      : `Delete "${row.name}"?`;
    if (!confirm(warning)) return;

    setError("");
    setBusyId(row.id);
    startTransition(async () => {
      try {
        await deleteAssetType(row.id);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not delete asset type.");
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Asset Types &amp; Pricing</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Price per asset type for each job category. Leave a cell blank to use the category price.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setError(""); }}
            className="flex shrink-0 items-center justify-center gap-2 bg-[#151513] hover:bg-[#26251f] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition"
          >
            <PlusCircle className="w-4 h-4" /> Add Asset Type
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {adding && (
        <div className="mb-4 rounded-xl border border-[#F2B705]/40 bg-[#F2B705]/10 p-4">
          <h3 className="font-semibold text-gray-900 mb-2 text-sm">New Asset Type</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }}
              placeholder="e.g. Portable"
              className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B705]"
            />
            <button
              onClick={submitAdd}
              disabled={pending || !newName.trim()}
              className="flex items-center gap-2 rounded-lg bg-[#151513] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#26251f] disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
            </button>
            <button
              onClick={() => { setAdding(false); setNewName(""); setError(""); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          Add a job category first — prices are set per category.
        </div>
      ) : assetTypes.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          No asset types yet. Click &quot;Add Asset Type&quot; to start.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 min-w-44">Asset Type</th>
                {categories.map((c) => (
                  <th key={c.id} className="px-4 py-3 min-w-32 whitespace-nowrap">
                    {c.name}
                    <span className="ml-1 font-normal normal-case text-gray-400">
                      (RM {c.price.toFixed(2)})
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assetTypes.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    {editingId === row.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") submitRename(row.id); if (e.key === "Escape") setEditingId(null); }}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B705]"
                        />
                        <button onClick={() => submitRename(row.id)} disabled={pending}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-40" aria-label="Save name">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition" aria-label="Cancel rename">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-gray-900">{row.name}</span>
                    )}
                  </td>

                  {categories.map((c) => {
                    const key = cellKey(row.id, c.id);
                    return (
                      <td key={c.id} className="px-4 py-2.5">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">RM</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft[key] ?? ""}
                            placeholder={c.price.toFixed(2)}
                            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                            onBlur={(e) => saveCell(row.id, c.id, e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-1.5 pl-9 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B705]"
                          />
                          {savingCell === key && (
                            <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setEditingId(row.id); setEditName(row.name); setError(""); }}
                        className="p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 rounded-lg"
                        aria-label={`Rename ${row.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(row)}
                        disabled={busyId === row.id}
                        className="p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 rounded-lg disabled:opacity-40"
                        aria-label={`Delete ${row.name}`}
                      >
                        {busyId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        A blank cell falls back to the job category price shown in the column header, so a new
        category or asset type is never left unpriced.
      </p>
    </div>
  );
}
