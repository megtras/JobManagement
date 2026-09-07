"use client";

import { useState, useTransition } from "react";
import { PlusCircle, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import { createJobCategory, updateJobCategory, deleteJobCategory } from "@/lib/actions/inventory";
import { DesktopTable, EmptyList, MobileCardList, RecordCard, RecordMeta, ResponsiveListShell } from "@/components/ui/ResponsiveList";
import { usePagination, Pagination } from "@/components/ui/Pagination";

interface Category { id: string; name: string; price: number; minEvidencePhotos: number }

const PHOTO_TEMPLATE_OPTIONS = [
  { value: 3, label: "Template-3x" },
  { value: 5, label: "Template-5x" },
  { value: 10, label: "Template-10x" },
];

export function InventoryClient({ categories }: { categories: Category[] }) {
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(categories, 10);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editTemplate, setEditTemplate] = useState(3);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newTemplate, setNewTemplate] = useState(3);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function startEdit(c: Category) { setEditingId(c.id); setEditName(c.name); setEditPrice(String(c.price)); setEditTemplate(c.minEvidencePhotos ?? 3); setError(""); }
  function cancelEdit() { setEditingId(null); setError(""); }

  function submitEdit(id: string) {
    setError("");
    startTransition(async () => {
      try { await updateJobCategory(id, { name: editName, price: parseFloat(editPrice) || 0, minEvidencePhotos: editTemplate }); setEditingId(null); }
      catch (e: unknown) { setError(e instanceof Error ? e.message : "Error."); }
    });
  }

  function submitAdd() {
    setError("");
    startTransition(async () => {
      try { await createJobCategory({ name: newName, price: parseFloat(newPrice) || 0, minEvidencePhotos: newTemplate }); setNewName(""); setNewPrice(""); setNewTemplate(3); setAdding(false); }
      catch (e: unknown) { setError(e instanceof Error ? e.message : "Error."); }
    });
  }

  function handleDelete(c: Category) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    setDeletingId(c.id);
    startTransition(async () => {
      try { await deleteJobCategory(c.id); }
      catch (e: unknown) { alert(e instanceof Error ? e.message : "Error."); }
      finally { setDeletingId(null); }
    });
  }

  const textInput = (value: string, onChange: (value: string) => void, placeholder?: string, autoFocus = false) => (
    <input autoFocus={autoFocus} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
  );

  const priceInput = (value: string, onChange: (value: string) => void) => (
    <input type="number" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)} placeholder="0.00"
      className="w-full sm:w-32 px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
  );

  const templateSelect = (value: number, onChange: (value: number) => void) => (
    <select value={value} onChange={e => onChange(Number(e.target.value))}
      className="w-full sm:w-36 px-3 py-2 rounded-lg border border-blue-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      {PHOTO_TEMPLATE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );

  const editActions = (id: string) => (
    <div className="flex items-center justify-end gap-1">
      <button onClick={() => submitEdit(id)} disabled={pending}
        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button onClick={cancelEdit} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition"><X className="w-4 h-4" /></button>
    </div>
  );

  const rowActions = (c: Category) => (
    <div className="flex items-center justify-end gap-1">
      <button onClick={() => startEdit(c)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Pencil className="w-4 h-4" /></button>
      <button onClick={() => handleDelete(c)} disabled={pending && deletingId === c.id}
        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30">
        {pending && deletingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Job categories &amp; price per unit/asset</p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setError(""); }}
            className="flex shrink-0 items-center justify-center gap-2 bg-[#151513] hover:bg-[#26251f] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition">
            <PlusCircle className="w-4 h-4" /> Add Category
          </button>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>}

      <ResponsiveListShell>
        <DesktopTable>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 w-44">Price / Unit</th>
                <th className="px-4 py-3 w-40">Template</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {adding && (
                <tr className="bg-blue-50">
                  <td className="px-4 py-2.5 text-gray-300">—</td>
                  <td className="px-4 py-2.5">{textInput(newName, setNewName, "Category name", true)}</td>
                  <td className="px-4 py-2.5">{priceInput(newPrice, setNewPrice)}</td>
                  <td className="px-4 py-2.5">{templateSelect(newTemplate, setNewTemplate)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={submitAdd} disabled={pending || !newName.trim()}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-40">
                        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button onClick={() => { setAdding(false); setError(""); }}
                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition"><X className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              )}
              {pageItems.map((c, i) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-4 py-3">
                    {editingId === c.id ? textInput(editName, setEditName, "Category name", true) : <span className="font-medium text-gray-900">{c.name}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === c.id ? priceInput(editPrice, setEditPrice) : <span className="font-semibold text-blue-700">RM {c.price.toFixed(2)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === c.id ? templateSelect(editTemplate, setEditTemplate) : <span className="font-medium text-gray-700">Template-{c.minEvidencePhotos ?? 3}x</span>}
                  </td>
                  <td className="px-4 py-3">{editingId === c.id ? editActions(c.id) : rowActions(c)}</td>
                </tr>
              ))}
              {categories.length === 0 && !adding && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No categories yet. Click "Add Category" to start.</td></tr>
              )}
            </tbody>
          </table>
        </DesktopTable>

        <MobileCardList>
          {adding && (
            <RecordCard className="border-blue-200 bg-blue-50">
              <h2 className="font-semibold text-blue-900">New Category</h2>
              <div className="mt-3 space-y-3">
                {textInput(newName, setNewName, "Category name", true)}
                {priceInput(newPrice, setNewPrice)}
                {templateSelect(newTemplate, setNewTemplate)}
                <div className="flex gap-2">
                  <button onClick={submitAdd} disabled={pending || !newName.trim()}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#151513] hover:bg-[#26251f] text-white text-sm py-2 rounded-lg disabled:opacity-40 transition">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
                  </button>
                  <button onClick={() => { setAdding(false); setError(""); }}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-white transition">Cancel</button>
                </div>
              </div>
            </RecordCard>
          )}
          {pageItems.map((c) => (
            <RecordCard key={c.id}>
              {editingId === c.id ? (
                <div className="space-y-3">
                  {textInput(editName, setEditName, "Category name", true)}
                  {priceInput(editPrice, setEditPrice)}
                  {templateSelect(editTemplate, setEditTemplate)}
                  {editActions(c.id)}
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-gray-900 break-words">{c.name}</h2>
                    <span className="shrink-0 font-semibold text-blue-700">RM {c.price.toFixed(2)}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <RecordMeta label="Price / Unit" value={<span className="font-semibold text-blue-700">RM {c.price.toFixed(2)}</span>} />
                    <RecordMeta label="Template" value={`Template-${c.minEvidencePhotos ?? 3}x`} />
                  </div>
                  <div className="mt-4 border-t border-gray-100 pt-3">{rowActions(c)}</div>
                </>
              )}
            </RecordCard>
          ))}
          {categories.length === 0 && !adding && <EmptyList>No categories yet. Click "Add Category" to start.</EmptyList>}
        </MobileCardList>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </ResponsiveListShell>
      <p className="mt-4 text-xs text-gray-400">Price is per unit/asset. Appointment total = price x number of assets.</p>
    </div>
  );
}
