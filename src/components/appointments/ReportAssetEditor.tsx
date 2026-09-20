"use client";

export interface ReportAssetDraft {
  id: string;
  isNew?: boolean;
  label: string;
  acType: string;
  jobCategoryId: string;
  unitPrice: string;
  billingType: "CHARGEABLE" | "WARRANTY";
  remarks: string;
  technicianRemark: string;
  additionalAddress: string;
  propertyType: string;
  workLocationAddress: string;
}

export function ReportAssetEditor({ assets, categories, disabled, onChange, onAdd, onRemove }: {
  assets: ReportAssetDraft[];
  categories: { id: string; name: string; price: number }[];
  disabled: boolean;
  onChange: (id: string, patch: Partial<ReportAssetDraft>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800";
  return (
    <fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assets and remarks</p>
        <button type="button" onClick={onAdd} className="rounded-lg border border-[#F2B705]/40 bg-white px-3 py-2 text-xs font-semibold text-[#151513]">Add asset</button>
      </div>
      <p className="text-xs text-gray-500">Asset and price changes update the task list, total and PDF. Existing payment records are retained. Removing an asset keeps its photos as general report photos.</p>
      {!assets.length && <p className="text-sm text-gray-500">No assets. Add an asset to record the work completed.</p>}
      {assets.map((asset, index) => (
        <div key={asset.id} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Asset {index + 1}{asset.isNew ? " (new)" : ""}</p>
            <button type="button" onClick={() => onRemove(asset.id)} className="text-xs font-semibold text-red-600">Remove asset</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["label", "Asset name", 200], ["acType", "AC type", 120],
              ["propertyType", "Property type", 120], ["workLocationAddress", "Work location", 4000],
              ["additionalAddress", "Additional address", 4000],
            ] as const).map(([key, label, maxLength]) => (
              <label key={key} className="space-y-1 text-xs text-gray-600">
                <span>{label}</span>
                <input aria-label={`Asset ${index + 1} ${label}`} maxLength={maxLength} value={asset[key]} onChange={(event) => onChange(asset.id, { [key]: event.target.value })} className={inputClass} />
              </label>
            ))}
            <label className="space-y-1 text-xs text-gray-600">
              <span>Job category</span>
              <select value={asset.jobCategoryId} onChange={(event) => onChange(asset.id, { jobCategoryId: event.target.value })} className={inputClass}>
                <option value="">No category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>Unit price (RM)</span>
              <input type="number" required min="0" max="99999999.99" step="0.01" value={asset.unitPrice} onChange={(event) => onChange(asset.id, { unitPrice: event.target.value })} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs text-gray-600">
              <span>Billing</span>
              <select value={asset.billingType} onChange={(event) => onChange(asset.id, { billingType: event.target.value as ReportAssetDraft["billingType"] })} className={inputClass}>
                <option value="CHARGEABLE">Chargeable</option><option value="WARRANTY">FOC (Warranty)</option>
              </select>
            </label>
            {([ ["remarks", "Remark"], ["technicianRemark", "Technician remark"] ] as const).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-gray-600 sm:col-span-2">
                <span>{label}</span>
                <textarea rows={3} maxLength={4000} value={asset[key]} onChange={(event) => onChange(asset.id, { [key]: event.target.value })} className={inputClass} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
