"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, MapPin, Plus, Trash2, AlertTriangle, CalendarPlus } from "lucide-react";
import { createCustomer, findCustomerByPhone, updateCustomer } from "@/lib/actions/customers";
import { AddressPickerModal } from "./AddressPickerModal";

interface Branch { id: string; name: string }
interface CustomerAddress { id?: string; address: string; lat: number | null; lng: number | null }
interface CustomerRow {
  id: string; name: string; custType: string; phone: string; phone2: string | null; email: string | null;
  area: string; propertyType: string; jobCategoryId: string | null; branchId: string; status: string;
  addresses: CustomerAddress[];
}
interface DuplicateCustomer {
  id: string;
  custNo: number;
  name: string;
  phone: string;
  branchId: string;
}

const CUST_TYPE_OPTIONS = [
  { value: "CORPORATE", label: "Corporate" },
  { value: "END_USER",  label: "End User"  },
];

const PROPERTY_TYPE_OPTIONS = [
  { value: "CONDO",   label: "Condo"   },
  { value: "LANDED",  label: "Landed"  },
  { value: "OFFICE",  label: "Office"  },
  { value: "FACTORY", label: "Factory" },
  { value: "OTHERS",  label: "Others"  },
];

interface Props {
  open: boolean; onClose: () => void;
  branches: Branch[];
  editing?: CustomerRow | null;
  defaultBranchId?: string;
  onDuplicateAppointment?: (customerId: string) => void;
  initialValues?: Partial<Pick<CustomerRow, "name" | "phone" | "email" | "area" | "custType" | "propertyType">>;
  onCreated?: (customerId: string) => void;
}

export function CustomerModal({
  open,
  onClose,
  branches,
  editing,
  defaultBranchId,
  onDuplicateAppointment,
  initialValues,
  onCreated,
}: Props) {
  const isEdit = !!editing;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [showPhoneError, setShowPhoneError] = useState(false);
  const [duplicateCustomer, setDuplicateCustomer] = useState<DuplicateCustomer | null>(null);
  const [name, setName] = useState("");
  const [custType, setCustType] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [email, setEmail] = useState("");
  const [area, setArea] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const branchRequired = false;

  /* eslint-disable react-hooks/set-state-in-effect -- reset local draft fields when the modal target changes */
  useEffect(() => {
    if (editing) {
      setName(editing.name); setCustType(editing.custType ?? ""); setPhone(editing.phone); setPhone2(editing.phone2 ?? "");
      setEmail(editing.email ?? ""); setArea(editing.area); setPropertyType(editing.propertyType ?? ""); setBranchId(editing.branchId);
      setAddresses(editing.addresses ?? []);
    } else {
      setName(initialValues?.name ?? ""); setCustType(initialValues?.custType ?? ""); setPhone(initialValues?.phone ?? ""); setPhone2(""); setEmail(initialValues?.email ?? ""); setArea(initialValues?.area ?? ""); setPropertyType(initialValues?.propertyType ?? "");
      setBranchId(defaultBranchId ?? "");
      setAddresses([]);
    }
    setError("");
    setShowPhoneError(false);
    setDuplicateCustomer(null);
  }, [editing, open, defaultBranchId, initialValues]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  // Only the phone number is required. Every other field can be filled in later;
  // the deal is closed when an appointment is set for the customer, not here.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    if (!phone.trim()) {
      setShowPhoneError(true);
      return;
    }
    setShowPhoneError(false);
    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateCustomer(editing.id, {
            name, custType, phone, phone2, email: email || undefined, area, propertyType, addresses,
          });
        } else {
          const duplicate = await findCustomerByPhone(phone, branchId);
          if (duplicate) {
            setDuplicateCustomer(duplicate);
            return;
          }
          const created = await createCustomer({
            name, custType, phone, phone2, email: email || undefined,
            area, propertyType, branchId, addresses,
          });
          onCreated?.(created.id);
        }
        router.refresh();
        onClose();
      } catch (err: unknown) {
        if (!isEdit) {
          const duplicate = await findCustomerByPhone(phone, branchId);
          if (duplicate) {
            setDuplicateCustomer(duplicate);
            return;
          }
        }
        setError(err instanceof Error ? err.message : "An error occurred.");
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{isEdit ? "Edit Customer" : "Add New Customer"}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-gray-400 font-normal">(optional)</span></label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Lead"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Type <span className="text-gray-400 font-normal">(optional)</span></label>
              <select value={custType} onChange={e => setCustType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select type —</option>
                {CUST_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number 1</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
                placeholder="01x-xxxxxxxx"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {showPhoneError && !phone.trim() && <p className="mt-1 text-xs text-red-500">Phone number is required.</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number 2 <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="tel" value={phone2} onChange={e => setPhone2(e.target.value)}
                placeholder="01x-xxxxxxxx"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Addresses */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Addresses <span className="text-gray-400 font-normal">(optional)</span></label>
                <button type="button" onClick={() => setShowAddressPicker(true)}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition">
                  <Plus className="w-3.5 h-3.5" /> Add Address
                </button>
              </div>
              {addresses.length > 0 && (
                <ul className="space-y-2">
                  {addresses.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <span className="flex-1 text-xs text-gray-700 leading-relaxed">{a.address}</span>
                      <button type="button" onClick={() => setAddresses(prev => prev.filter((_, j) => j !== i))}
                        className="text-gray-300 hover:text-red-500 transition shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">District <span className="text-gray-400 font-normal">(optional)</span></label>
              <input value={area} onChange={e => setArea(e.target.value)}
                placeholder="e.g. Petaling Jaya"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Type <span className="text-gray-400 font-normal">(optional)</span></label>
              <select value={propertyType} onChange={e => setPropertyType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select property —</option>
                {PROPERTY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {branchRequired && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <select value={branchId} onChange={e => setBranchId(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
              <button type="submit" disabled={pending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#28a89d] hover:bg-[#1f8c82] disabled:bg-[#28a89d]/50 text-white text-sm font-medium transition">
                {pending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : isEdit ? "Update" : "Add Customer"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showAddressPicker && (
        <AddressPickerModal
          onAdd={(addr, lat, lng, district) => {
            setAddresses(prev => [...prev, { address: addr, lat, lng }]);
            // Auto-detect the District from the picked address (don't overwrite a manual entry).
            if (district) setArea(prev => prev.trim() || district);
          }}
          onClose={() => setShowAddressPicker(false)}
        />
      )}

      {duplicateCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
            <div className="px-6 pt-5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">Phone number already exists</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                This number belongs to {duplicateCustomer.name || "Unnamed customer"} (CU-{String(duplicateCustomer.custNo).padStart(4, "0")}).
                You can add an appointment for this existing customer instead.
              </p>
              <p className="mt-2 text-sm font-medium text-gray-800">{duplicateCustomer.phone}</p>
            </div>
            <div className="mt-5 flex gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setDuplicateCustomer(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDuplicateAppointment?.(duplicateCustomer.id);
                  setDuplicateCustomer(null);
                  onClose();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#28a89d] py-2.5 text-sm font-medium text-white transition hover:bg-[#1f8c82]"
              >
                <CalendarPlus className="h-4 w-4" /> Add Appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
