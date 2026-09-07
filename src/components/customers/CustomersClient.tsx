"use client";

import { useState, useTransition, type ElementType } from "react";
import Link from "next/link";
import { UserPlus, Pencil, Trash2, Loader2, CalendarPlus, Users, UserCheck, Clock, CalendarClock, FileText, X } from "lucide-react";
import { deleteCustomer } from "@/lib/actions/customers";
import { CustomerModal } from "./CustomerModal";
import { AppointmentModal } from "@/components/appointments/AppointmentModal";
import { useBranchScope } from "@/components/layout/BranchScopeProvider";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { DesktopTable, EmptyList, MobileCardList, RecordCard, RecordMeta, ResponsiveListShell } from "@/components/ui/ResponsiveList";
import { usePagination, Pagination } from "@/components/ui/Pagination";
import { type PeriodView, inPeriod } from "@/lib/period";

interface Branch { id: string; name: string }
interface Category { id: string; name: string; price: number }
interface TeamMember { id: string; name: string }
interface TeamOpt { id: string; name: string; branchId: string; members: TeamMember[] }
interface CustomerAddress { id?: string; address: string; lat: number | null; lng: number | null }
interface ServiceHistoryItem {
  id: string;
  jobNo: number;
  jobTitle: string;
  date: string;
  time: string;
  timeFinish: string;
  status: string;
  totalPrice: number;
  billingType: string;
  warrantyNote: string | null;
  jobCategory: { name: string } | null;
  teams: { name: string }[];
  assets: {
    acType: string;
    remarks: string | null;
    technicianRemark: string | null;
    jobCategory: { name: string } | null;
  }[];
}
interface CustomerRow {
  id: string; custNo: number; name: string; custType: string; phone: string; phone2: string | null; email: string | null;
  area: string; propertyType: string; jobCategoryId: string | null; branchId: string; status: string; createdAt: string;
  branch: { id: string; name: string };
  jobCategory: { id: string; name: string } | null;
  addresses: CustomerAddress[];
  serviceDue: boolean;
  lastServiceAt: string | null;
  nextServiceDueAt: string | null;
  serviceHistory: ServiceHistoryItem[];
  _count: { appointments: number };
}

interface Props {
  customers: CustomerRow[];
  branches: Branch[];
  categories: Category[];
  teams: TeamOpt[];
  isSupervisor: boolean;
  userBranchId: string | null;
  initialServiceDueOnly?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CLOSED: "bg-green-100 text-green-700",
};

const DEAL_LABEL: Record<string, string> = {
  PENDING: "Pending Deal",
  CLOSED: "Closed Deal",
};

function StatBox({ label, value, icon: Icon, color, active = false, onClick }: {
  label: string; value: number; icon: ElementType; color: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-white rounded-xl border p-4 flex items-start gap-3 text-left transition ${
        active ? "border-blue-500 ring-2 ring-blue-100 shadow-sm" : "border-gray-200 hover:border-blue-300 hover:shadow-sm"
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
      </div>
    </button>
  );
}

function formatServiceDate(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

function historyTotal(item: ServiceHistoryItem) {
  return item.billingType === "WARRANTY" || item.totalPrice <= 0 ? "FOC" : `RM ${item.totalPrice.toFixed(2)}`;
}

export function CustomersClient({ customers, branches, categories, teams, isSupervisor, userBranchId, initialServiceDueOnly = false }: Props) {
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [custModal, setCustModal] = useState(false);
  const [editingCust, setEditingCust] = useState<CustomerRow | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<CustomerRow | null>(null);
  const [apptModal, setApptModal] = useState(false);
  const [apptCustomerId, setApptCustomerId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "CLOSED">("ALL");
  const [serviceDueOnly, setServiceDueOnly] = useState(initialServiceDueOnly);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<PeriodView>("TODAY");
  const [cursor, setCursor] = useState(() => new Date());
  const normalizedSearch = search.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;
  const { selectedBranchId } = useBranchScope();
  const branchFilterId = isSupervisor ? selectedBranchId : "ALL";

  const filtered = customers
    .filter((c) => branchFilterId === "ALL" || c.branchId === branchFilterId)
    .filter((c) => !serviceDueOnly || c.serviceDue)
    .filter((c) => statusFilter === "ALL" || c.status === statusFilter)
    .filter((c) => isSearching || inPeriod(c.createdAt, view, cursor))
    .filter((c) => {
      if (!normalizedSearch) return true;
      return (
        c.name.toLowerCase().includes(normalizedSearch)
        || c.phone.toLowerCase().includes(normalizedSearch)
        || (c.phone2?.toLowerCase().includes(normalizedSearch) ?? false)
      );
    })
    .sort((a, b) => b.custNo - a.custNo); // newest first
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filtered, 10);

  // Summary cards: scoped to branch + period, independent of the status tab.
  const scoped = customers
    .filter((c) => branchFilterId === "ALL" || c.branchId === branchFilterId)
    .filter((c) => inPeriod(c.createdAt, view, cursor));
  const totalCount = scoped.length;
  const closedCount = scoped.filter((c) => c.status === "CLOSED").length;
  const pendingCount = scoped.filter((c) => c.status === "PENDING").length;
  const serviceDueCount = scoped.filter((c) => c.serviceDue).length;

  function openAddAppt(c: CustomerRow) { setApptCustomerId(c.id); setApptModal(true); }

  function handleDelete(c: CustomerRow) {
    if (c._count.appointments > 0) {
      alert(`This customer has ${c._count.appointments} appointment(s) and cannot be deleted.`);
      return;
    }
    if (!confirm(`Delete customer "${c.name}"? This cannot be undone.`)) return;
    setDeletingId(c.id);
    startTransition(async () => {
      try { await deleteCustomer(c.id); }
      catch (e: unknown) { alert(e instanceof Error ? e.message : "An error occurred."); }
      finally { setDeletingId(null); }
    });
  }

  const customerActions = (c: CustomerRow, mobile = false) => (
    <div className={`flex items-center justify-end ${mobile ? "gap-2" : "gap-1"}`}>
      <button onClick={() => openAddAppt(c)} title={c.status === "PENDING" ? "Set Appointment (closes deal)" : "Add Appointment"}
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition`}>
        <CalendarPlus className="w-4 h-4" />
      </button>
      <button onClick={() => setHistoryCustomer(c)} title="Service History"
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-[#151513] hover:bg-[#F2B705]/10 rounded-lg transition`}>
        <FileText className="w-4 h-4" />
      </button>
      <button onClick={() => { setEditingCust(c); setCustModal(true); }}
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition`}>
        <Pencil className="w-4 h-4" />
      </button>
      <button onClick={() => handleDelete(c)}
        disabled={pending && deletingId === c.id}
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30`}>
        {pending && deletingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {customers.length} customers</p>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <PeriodNav view={view} cursor={cursor}
            onChange={({ view: v, cursor: c }) => { setView(v); setCursor(c); }} />
          {(!isSupervisor || branchFilterId !== "ALL") && (
            <div className="flex flex-wrap items-center gap-2 lg:w-full lg:justify-end">
              <button onClick={() => { setEditingCust(null); setCustModal(true); }}
                className="flex min-w-[104px] justify-center shrink-0 items-center gap-2 bg-[#151513] hover:bg-[#26251f] text-white text-sm font-medium px-4 py-2 rounded-xl transition">
                <UserPlus className="w-4 h-4" /> Add
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatBox label="Total Customers" value={totalCount} icon={Users} color="bg-blue-100 text-blue-600" active={statusFilter === "ALL" && !serviceDueOnly} onClick={() => { setStatusFilter("ALL"); setServiceDueOnly(false); }} />
        <StatBox label="Pending Deals" value={pendingCount} icon={Clock} color="bg-amber-100 text-amber-600" active={statusFilter === "PENDING" && !serviceDueOnly} onClick={() => { setStatusFilter("PENDING"); setServiceDueOnly(false); }} />
        <StatBox label="Closed Deals" value={closedCount} icon={UserCheck} color="bg-green-100 text-green-600" active={statusFilter === "CLOSED" && !serviceDueOnly} onClick={() => { setStatusFilter("CLOSED"); setServiceDueOnly(false); }} />
        <StatBox label="Service Due" value={serviceDueCount} icon={CalendarClock} color="bg-[#F2B705]/20 text-[#151513]" active={serviceDueOnly} onClick={() => { setStatusFilter("ALL"); setServiceDueOnly(true); }} />
      </div>

      <div className="mt-[30px] mb-4 flex justify-end">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer name or phone"
          className="w-full sm:w-[420px] lg:w-[520px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <ResponsiveListShell>
        <DesktopTable>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3 w-24">ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 w-36">Phone</th>
                <th className="px-4 py-3 w-32">Area</th>
                <th className="px-4 py-3 w-32 hidden lg:table-cell">Branch</th>
                <th className="px-4 py-3 w-32 hidden xl:table-cell">Deal</th>
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((c, i) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700 whitespace-nowrap">CU-{String(c.custNo).padStart(4, "0")}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-gray-900">{c.name || "Unnamed"}</span>
                      {c.serviceDue && (
                        <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full bg-[#F2B705]/20 text-[#151513] text-xs font-medium">
                          Service Due
                        </span>
                      )}
                      <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium xl:hidden ${STATUS_COLOR[c.status] ?? ""}`}>
                        {DEAL_LABEL[c.status] ?? c.status}
                      </span>
                    </div>
                    {c._count.appointments > 0 && (
                      <div className="mt-0.5 text-xs text-gray-400">{c._count.appointments} appointment{c._count.appointments > 1 ? "s" : ""}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="truncate">{c.phone}</div>
                    {c.phone2 && <div className="truncate text-xs text-gray-400">{c.phone2}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate">{c.area || <span className="text-gray-300">-</span>}</td>
                  <td className="px-4 py-3 text-gray-600 truncate hidden lg:table-cell">{c.branch.name}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] ?? ""}`}>
                      {DEAL_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{customerActions(c)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No customers found.</td></tr>
              )}
            </tbody>
          </table>
        </DesktopTable>

        <MobileCardList>
          {pageItems.map((c) => (
            <RecordCard key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium text-blue-700">CU-{String(c.custNo).padStart(4, "0")}</p>
                  <h2 className="mt-1 font-semibold text-gray-900 break-words">{c.name || "Unnamed customer"}</h2>
                  {c._count.appointments > 0 && (
                    <p className="text-xs text-gray-400">{c._count.appointments} appointment{c._count.appointments > 1 ? "s" : ""}</p>
                  )}
                </div>
                <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] ?? ""}`}>
                  {DEAL_LABEL[c.status] ?? c.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <RecordMeta label="Phone" value={<>{c.phone}{c.phone2 && <span className="block text-xs text-gray-400">{c.phone2}</span>}</>} />
                <RecordMeta label="Area" value={c.area || <span className="text-gray-300">-</span>} />
                <RecordMeta label="Branch" value={c.branch.name} className="col-span-2" />
                {c.serviceDue && (
                  <RecordMeta label="Service Due" value={`Due since ${formatServiceDate(c.nextServiceDueAt)}`} className="col-span-2" />
                )}
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">{customerActions(c, true)}</div>
            </RecordCard>
          ))}
          {filtered.length === 0 && <EmptyList>No customers found.</EmptyList>}
        </MobileCardList>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </ResponsiveListShell>

      <CustomerModal open={custModal} onClose={() => setCustModal(false)}
        branches={branches} editing={editingCust}
        defaultBranchId={isSupervisor ? (branchFilterId !== "ALL" ? branchFilterId : undefined) : (userBranchId ?? undefined)}
        onDuplicateAppointment={(customerId) => {
          setCustModal(false);
          setEditingCust(null);
          setApptCustomerId(customerId);
          setApptModal(true);
        }} />

      <AppointmentModal open={apptModal} onClose={() => { setApptModal(false); setApptCustomerId(""); }}
        categories={categories} customers={customers} teams={teams}
        preselectedCustomerId={apptCustomerId} />

      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Service History</h2>
                <p className="text-sm text-gray-500">{historyCustomer.name || "Unnamed customer"}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                aria-label="Close service history"
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(85vh-76px)] space-y-3 overflow-y-auto p-5">
              {historyCustomer.serviceHistory.length > 0 ? (
                historyCustomer.serviceHistory.map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-medium text-blue-700">GP-{String(item.jobNo).padStart(4, "0")}</p>
                        <h3 className="mt-1 font-semibold text-gray-900">{item.jobTitle || item.jobCategory?.name || "Appointment"}</h3>
                        <p className="text-sm text-gray-500">
                          {formatServiceDate(item.date)} · {item.time}{item.timeFinish ? `-${item.timeFinish}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{item.status}</span>
                        <span className="font-semibold text-blue-700">{historyTotal(item)}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                      <div>
                        <span className="text-xs font-medium uppercase text-gray-400">Category</span>
                        <p>{item.jobCategory?.name || "-"}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium uppercase text-gray-400">Team</span>
                        <p>{item.teams.map((team) => team.name).join(", ") || "-"}</p>
                      </div>
                    </div>
                    {item.assets.length > 0 && (
                      <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                        <p className="text-xs font-medium uppercase text-gray-400">Work Done</p>
                        <ul className="mt-1 space-y-1">
                          {item.assets.map((asset, index) => (
                            <li key={`${item.id}-${index}`}>
                              {(asset.acType || "Asset")} · {asset.jobCategory?.name || item.jobCategory?.name || "-"}
                              {asset.technicianRemark ? ` · ${asset.technicianRemark}` : asset.remarks ? ` · ${asset.remarks}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-3">
                      <Link href={`/appointments/${item.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                        View Appointment
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyList>No service history yet.</EmptyList>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
