"use client";

import { useEffect, useState, useTransition, type ElementType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Pencil, Trash2, Loader2, MapPin, Eye, CopyPlus, CheckCircle2, Image as ImageIcon, CalendarDays, Clock, PlayCircle, X, AlertTriangle, FileText, Copy } from "lucide-react";
import { deleteAppointment } from "@/lib/actions/appointments";
import { AppointmentModal } from "./AppointmentModal";
import { useBranchScope } from "@/components/layout/BranchScopeProvider";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { DesktopTable, EmptyList, MobileCardList, RecordCard, RecordMeta, ResponsiveListShell } from "@/components/ui/ResponsiveList";
import { usePagination, Pagination } from "@/components/ui/Pagination";
import { UrgentTag } from "@/components/ui/UrgentTag";
import { type PeriodView, inPeriod } from "@/lib/period";
import { isPdfReceiptUrl } from "@/lib/receipt-files";
import { normalizeUploadUrl } from "@/lib/upload-urls";

interface Branch { id: string; name: string }
interface Category { id: string; name: string; price: number }
interface CustomerAddress { id?: string; address: string; lat: number | null; lng: number | null }
interface CustomerOpt { id: string; name: string; phone: string; branchId: string; propertyType: string; status?: string; addresses: CustomerAddress[] }
interface TeamMember { id: string; name: string }
interface TeamRef { id: string; name: string; members: TeamMember[] }
interface TeamOpt { id: string; name: string; branchId: string; members: TeamMember[] }

interface AppointmentRow {
  id: string; jobNo: number; customerId: string; jobCategoryId: string | null; jobTitle: string;
  date: string; time: string; timeFinish: string; locationAddress: string;
  locationLat: number; locationLng: number; locationWazeLink: string;
  status: "COMING_SOON" | "IN_PROGRESS" | "DONE";
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  urgent?: boolean;
  checkInSosRequestedAt?: string | null;
  checkInSosResolvedAt?: string | null;
  totalPrice: number;
  branchId: string;
  approvedAt: string | null;
  payment: { id: string; status: string; method: string; receiptPhotoUrl: string | null } | null;
  clockIn: string | null;
  clockOut: string | null;
  parent: { id: string; jobTitle: string } | null;
  assets: Array<{
    id: string;
    label: string;
    acType?: string | null;
    unitPrice?: number;
    remarks?: string | null;
    additionalAddress: string | null;
    propertyType: string | null;
    workLocationAddress: string | null;
    workLocationLat: number | null;
    workLocationLng: number | null;
  }>;
  customer: { id: string; name: string; phone: string };
  branch: { id: string; name: string };
  jobCategory: { id: string; name: string; price: number } | null;
  teams: TeamRef[];
}

interface Props {
  appointments: AppointmentRow[];
  branches: Branch[];
  categories: Category[];
  customers: CustomerOpt[];
  teams: TeamOpt[];
  isSupervisor: boolean;
  canManageCompletion: boolean;
  canSchedulePastTime: boolean;
  initialUrgentOnly?: boolean;
  initialOverdueOnly?: boolean;
  initialSosOnly?: boolean;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash", QR_TRANSFER: "QR/Bank", OFFICE: "Office",
};

const STATUS_CONFIG = {
  COMING_SOON: { label: "Coming Soon", badge: "bg-blue-100 text-blue-700" },
  IN_PROGRESS: { label: "In Progress", badge: "bg-amber-100 text-amber-700" },
  DONE: { label: "Done", badge: "bg-green-100 text-green-700" },
} as const;

type AppointmentFilter = "ALL" | "COMING_SOON" | "IN_PROGRESS" | "DONE" | "URGENT" | "OVERDUE" | "SOS";

function deriveJobStatus(row: { status?: string; clockIn: string | null; payment: { status: string } | null }): keyof typeof STATUS_CONFIG {
  if (row.status === "DONE") return "DONE";
  if (row.payment?.status === "APPROVED") return "DONE";
  if (row.clockIn) return "IN_PROGRESS";
  return "COMING_SOON";
}

function officePaymentNeedsProof(a: AppointmentRow) {
  return !!a.payment && a.payment.method === "OFFICE" && !a.payment.receiptPhotoUrl;
}

function totalLabel(a: AppointmentRow) {
  return a.totalPrice <= 0 ? "FOC" : `RM ${a.totalPrice.toFixed(2)}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isOverdue(a: AppointmentRow) {
  const status = deriveJobStatus(a);
  return ["COMING_SOON", "IN_PROGRESS"].includes(status) && new Date(a.date) < startOfToday();
}

function hasPendingSos(a: AppointmentRow) {
  return !!a.checkInSosRequestedAt && !a.checkInSosResolvedAt;
}

function StatBox({ label, value, icon: Icon, color, active = false, highlight = false, highlightClass = "bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm", onClick }: {
  label: string; value: number; icon: ElementType; color: string; active?: boolean; highlight?: boolean; highlightClass?: string; onClick?: () => void;
}) {
  const stateClass = active
    ? "bg-white border-blue-500 ring-2 ring-blue-100 shadow-sm"
    : highlight ? highlightClass : "bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 flex items-start gap-3 text-left transition ${stateClass}`}
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

function teamNames(a: AppointmentRow) {
  return a.teams.length > 0 ? a.teams.map((t) => t.name).join(", ") : "";
}

function teamSummary(a: AppointmentRow) {
  const names = a.teams.map((t) => t.name);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1} more`;
}

// Keep demo appointment shares local; never point them to the live GenPlus site.
const TERMS_URL = "/terms-and-conditions";

function appointmentShareMessage(a: AppointmentRow) {
  const time = `${a.time}${a.timeFinish ? `-${a.timeFinish}` : ""}`;
  return [
    `Hi ${a.customer.name}, this is Megtras.`,
    "",
    "Your appointment has been scheduled:",
    `Job: ${a.jobTitle || a.jobCategory?.name || "-"}`,
    `Date: ${formatDate(a.date)}`,
    `Time: ${time}`,
    `Location: ${a.locationAddress || "-"}`,
    `Team: ${teamNames(a) || "To be assigned"}`,
    `Total: ${totalLabel(a)}`,
    "",
    `View our terms & conditions here: ${TERMS_URL}`,
    "",
    "Thank you.",
  ].join("\n");
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea fallback for older or restricted browsers.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }
}

function copyAppointmentShareMessage(a: AppointmentRow) {
  return copyTextToClipboard(appointmentShareMessage(a));
}

export function AppointmentsClient({
  appointments,
  branches,
  categories,
  customers,
  teams,
  isSupervisor,
  canManageCompletion,
  canSchedulePastTime,
  initialUrgentOnly = false,
  initialOverdueOnly = false,
  initialSosOnly = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingPay, setTogglingPay] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<AppointmentRow | null>(null);
  const [subJob, setSubJob] = useState<{ parentId: string; customerId: string } | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const initialFilter: AppointmentFilter = initialSosOnly ? "SOS" : initialUrgentOnly ? "URGENT" : initialOverdueOnly ? "OVERDUE" : "ALL";
  const [appointmentFilter, setAppointmentFilter] = useState<AppointmentFilter>(initialFilter);
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<PeriodView>("TODAY");
  const [cursor, setCursor] = useState(() => new Date());
  const [popViewer, setPopViewer] = useState<string | null>(null);
  const normalizedSearch = search.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;
  const { selectedBranchId } = useBranchScope();
  const branchFilterId = isSupervisor ? selectedBranchId : "ALL";

  function preserveWindowScroll() {
    if (typeof window === "undefined") return () => {};
    const scrollY = window.scrollY;
    return () => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    };
  }

  // Teams a job can be filtered by — narrowed to the selected branch.
  const teamOptions = teams.filter((t) => branchFilterId === "ALL" || t.branchId === branchFilterId);
  // Teams belong to one branch, so reset the team when the global branch changes.
  useEffect(() => { setTeamFilter("ALL"); }, [branchFilterId]);

  const filtered = appointments
    .filter((a) => branchFilterId === "ALL" || a.branchId === branchFilterId)
    .filter((a) => teamFilter === "ALL" || a.teams.some((t) => t.id === teamFilter))
    .filter((a) => appointmentFilter !== "URGENT" || !!a.urgent)
    .filter((a) => appointmentFilter !== "OVERDUE" || isOverdue(a))
    .filter((a) => appointmentFilter !== "SOS" || hasPendingSos(a))
    .filter((a) => appointmentFilter === "ALL" || appointmentFilter === "URGENT" || appointmentFilter === "OVERDUE" || appointmentFilter === "SOS" || deriveJobStatus(a) === appointmentFilter)
    .filter((a) => isSearching || appointmentFilter === "URGENT" || appointmentFilter === "OVERDUE" || appointmentFilter === "SOS" || inPeriod(a.date, view, cursor))
    .filter((a) => {
      if (!normalizedSearch) return true;
      return (
        a.customer.name.toLowerCase().includes(normalizedSearch)
        || a.customer.phone.toLowerCase().includes(normalizedSearch)
        || a.jobTitle.toLowerCase().includes(normalizedSearch)
        || a.locationAddress.toLowerCase().includes(normalizedSearch)
      );
    });
  const modalBranchId = branchFilterId !== "ALL" ? branchFilterId : undefined;
  const modalCustomers = modalBranchId
    ? customers.filter((c) => c.branchId === modalBranchId)
    : customers;
  const modalTeams = modalBranchId
    ? teams.filter((t) => t.branchId === modalBranchId)
    : teams;

  function closeModal() { setModal(false); setEditing(null); setSubJob(null); }
  function openAdd() { setEditing(null); setSubJob(null); setModal(true); }
  function openEdit(a: AppointmentRow) { setEditing(a); setSubJob(null); setModal(true); }
  function openSubJob(a: AppointmentRow) { setEditing(null); setSubJob({ parentId: a.id, customerId: a.customerId }); setModal(true); }

  async function handleCopyAppointment(a: AppointmentRow) {
    const copied = await copyAppointmentShareMessage(a);
    if (!copied) {
      alert("Could not copy appointment details. Please try again.");
      return;
    }

    setCopiedShareId(a.id);
    window.setTimeout(() => {
      setCopiedShareId((current) => current === a.id ? null : current);
    }, 2000);
  }

  function handleAppointmentSaved(saved?: { date?: string }) {
    setAppointmentFilter("ALL");
    setSearch("");
    setTeamFilter("ALL");
    if (saved?.date) setCursor(new Date(saved.date));
    router.refresh();
  }

  function handleDelete(a: AppointmentRow) {
    if (!confirm(`Delete appointment for "${a.customer.name}"?`)) return;
    setDeletingId(a.id);
    startTransition(async () => {
      try { await deleteAppointment(a.id); }
      catch (e: unknown) { alert(e instanceof Error ? e.message : "An error occurred."); }
      finally { setDeletingId(null); }
    });
  }

  function handleTogglePayment(paymentId: string) {
    setTogglingPay(paymentId);
    startTransition(async () => {
      try {
        const restoreScroll = preserveWindowScroll();
        const res = await fetch(`/api/payments/${paymentId}/toggle`, { method: "POST" });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Toggle failed");
        router.refresh();
        restoreScroll();
      } catch (e: unknown) { alert(e instanceof Error ? e.message : "An error occurred."); }
      finally { setTogglingPay(null); }
    });
  }

  const sorted = [...filtered].sort((a, b) => b.jobNo - a.jobNo); // newest first
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(sorted, 10);

  const baseScoped = appointments
    .filter((a) => branchFilterId === "ALL" || a.branchId === branchFilterId)
    .filter((a) => teamFilter === "ALL" || a.teams.some((t) => t.id === teamFilter));
  const periodScoped = baseScoped.filter((a) => inPeriod(a.date, view, cursor));
  const totalCount = periodScoped.length;
  const comingCount = periodScoped.filter((a) => deriveJobStatus(a) === "COMING_SOON").length;
  const progressCount = periodScoped.filter((a) => deriveJobStatus(a) === "IN_PROGRESS").length;
  const doneCount = periodScoped.filter((a) => deriveJobStatus(a) === "DONE").length;
  const urgentCount = baseScoped.filter((a) => !!a.urgent).length;
  const overdueCount = baseScoped.filter(isOverdue).length;

  const paymentType = (a: AppointmentRow) => {
    const isWarranty = a.billingType === "WARRANTY";
    const isFullyFoc = a.totalPrice <= 0;
    if (isWarranty && isFullyFoc) {
      return (
        <div className="min-w-0 space-y-1">
          <div className="truncate text-sm font-medium text-[#151513]">Warranty</div>
          <div className="text-xs text-gray-400">FOC</div>
        </div>
      );
    }
    if (isFullyFoc) return <div className="text-sm font-semibold text-[#151513]">FOC</div>;
    if (!a.payment) return <div className="text-sm text-gray-300">-</div>;
    const hasPop = !!a.payment.receiptPhotoUrl;
    const receiptUrl = hasPop ? normalizeUploadUrl(a.payment.receiptPhotoUrl) : "";
    const isPdf = isPdfReceiptUrl(receiptUrl);

    return (
      <div className="min-w-0 space-y-1.5">
        <div className="truncate text-sm font-medium text-gray-700">{PAYMENT_METHOD_LABEL[a.payment.method] ?? a.payment.method}</div>
        {hasPop && isPdf && (
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open PDF receipt"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            <FileText className="w-3.5 h-3.5" /> POP
          </a>
        )}
        {hasPop && !isPdf && (
          <button
            type="button"
            onClick={() => setPopViewer(receiptUrl)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            <ImageIcon className="w-3.5 h-3.5" /> POP
          </button>
        )}
      </div>
    );
  };

  const paymentStatus = (a: AppointmentRow) => {
    const isFullyFoc = a.totalPrice <= 0;
    if (isFullyFoc) {
      return (
        <div data-payment-status className="inline-flex rounded-full bg-[#F2B705]/10 px-2.5 py-1 text-xs font-semibold text-[#151513]">
          Not Required
        </div>
      );
    }
    if (!a.payment) return <div data-payment-status className="text-sm text-gray-300">-</div>;
    const approved = a.payment.status === "APPROVED";
    const busy = togglingPay === a.payment.id;
    const officeNeedsProof = officePaymentNeedsProof(a);

    return (
      <div data-payment-status className="flex justify-start">
        <span className="inline-flex rounded-full border border-gray-200 overflow-hidden text-xs font-semibold select-none shadow-sm">
          <button onClick={() => { if (!approved && !officeNeedsProof) handleTogglePayment(a.payment!.id); }} disabled={busy || officeNeedsProof}
            title={officeNeedsProof ? "Upload office payment proof first" : "Mark payment as received"}
            className={`min-w-9 px-2.5 py-1 transition disabled:opacity-60 disabled:cursor-not-allowed ${approved ? "bg-green-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
            {busy && !approved ? <Loader2 className="mx-auto w-3 h-3 animate-spin" /> : "Yes"}
          </button>
          <button onClick={() => { if (approved) handleTogglePayment(a.payment!.id); }} disabled={busy}
            title="Mark payment as not received"
            className={`min-w-9 px-2.5 py-1 border-l border-gray-200 transition disabled:opacity-60 ${!approved ? "bg-red-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
            {busy && approved ? <Loader2 className="mx-auto w-3 h-3 animate-spin" /> : "No"}
          </button>
        </span>
      </div>
    );
  };

  const actions = (a: AppointmentRow, mobile = false) => {
    const copied = copiedShareId === a.id;
    return (
    <div className={`flex items-center justify-end ${mobile ? "gap-2" : "gap-1"}`}>
      <button
        type="button"
        onClick={() => void handleCopyAppointment(a)}
        title={copied ? "Appointment message copied" : "Copy appointment message"}
        aria-label="Copy appointment message"
        className={`${mobile ? "p-2.5" : "p-2"} ${copied ? "text-green-600 bg-green-50" : "text-emerald-600 hover:bg-emerald-50"} rounded-lg transition`}
      >
        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
      <Link href={`/appointments/${a.id}`} title="View"
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition`}>
        <Eye className="w-4 h-4" />
      </Link>
      <button onClick={() => openSubJob(a)} title="Create Sub Job"
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition`}>
        <CopyPlus className="w-4 h-4" />
      </button>
      <button onClick={() => openEdit(a)} title="Edit"
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition`}>
        <Pencil className="w-4 h-4" />
      </button>
      <button onClick={() => handleDelete(a)} disabled={pending && deletingId === a.id} title="Delete"
        className={`${mobile ? "p-2.5" : "p-2"} text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30`}>
        {pending && deletingId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );
  };

  return (
    <>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-sm text-gray-500 mt-0.5">{sorted.length} of {appointments.length} appointments</p>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {teamOptions.length > 0 && (
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Filter by team"
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="ALL">All Teams</option>
                {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <PeriodNav view={view} cursor={cursor}
              onChange={({ view: v, cursor: c }) => { setView(v); setCursor(c); }} />
          </div>
          {(!isSupervisor || branchFilterId !== "ALL") && (
            <div className="flex flex-wrap items-center gap-2 lg:w-full lg:justify-end">
              <button onClick={openAdd}
                className="flex min-w-[104px] justify-center shrink-0 items-center gap-2 bg-[#151513] hover:bg-[#26251f] text-white text-sm font-medium px-4 py-2 rounded-xl transition">
                <CalendarPlus className="w-4 h-4" /> Add
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatBox label="Total Appointments" value={totalCount} icon={CalendarDays} color="bg-indigo-100 text-indigo-600" active={appointmentFilter === "ALL"} onClick={() => setAppointmentFilter("ALL")} />
        <StatBox label="Coming Soon" value={comingCount} icon={Clock} color="bg-blue-100 text-blue-600" active={appointmentFilter === "COMING_SOON"} onClick={() => setAppointmentFilter("COMING_SOON")} />
        <StatBox label="In Progress" value={progressCount} icon={PlayCircle} color="bg-amber-100 text-amber-600" active={appointmentFilter === "IN_PROGRESS"} onClick={() => setAppointmentFilter("IN_PROGRESS")} />
        <StatBox label="Done" value={doneCount} icon={CheckCircle2} color="bg-green-100 text-green-600" active={appointmentFilter === "DONE"} onClick={() => setAppointmentFilter("DONE")} />
        <StatBox label="Urgent Only" value={urgentCount} icon={AlertTriangle} color="bg-red-100 text-red-600" active={appointmentFilter === "URGENT"} highlight={urgentCount > 0} highlightClass="bg-red-50 border-red-300 hover:border-red-500 hover:shadow-sm" onClick={() => setAppointmentFilter("URGENT")} />
        <StatBox label="Overdue" value={overdueCount} icon={AlertTriangle} color="bg-orange-100 text-orange-600" active={appointmentFilter === "OVERDUE"} highlight={overdueCount > 0} highlightClass="bg-orange-50 border-orange-300 hover:border-orange-500 hover:shadow-sm" onClick={() => setAppointmentFilter("OVERDUE")} />
      </div>

      <div className="mt-[30px] mb-4 flex justify-end">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, phone, title, or location"
          className="w-full sm:w-[420px] lg:w-[520px] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <ResponsiveListShell>
        <DesktopTable>
          <table className="w-full min-w-[1360px] table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3 w-24">ID</th>
                <th className="px-4 py-3">Appointment</th>
                <th className="px-4 py-3 w-32">Job Status</th>
                <th className="px-4 py-3 w-40">Schedule</th>
                <th className="px-4 py-3 w-36 text-left">Total</th>
                <th className="px-4 py-3 w-36">Payment Type</th>
                <th className="px-4 py-3 w-40">Payment Status</th>
                <th className="pl-6 pr-4 py-3 w-56"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 align-top">
              {pageItems.map((a, i) => {
                const names = teamSummary(a);
                const fullTeamNames = teamNames(a);
                const jobStatus = deriveJobStatus(a);
                const pendingSos = hasPendingSos(a);
                return (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700 whitespace-nowrap">GP-{String(a.jobNo).padStart(4, "0")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-gray-900 truncate">{a.customer.name}</span>
                        {a.urgent && <UrgentTag />}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500 truncate">{a.jobTitle || a.jobCategory?.name || "-"}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{a.locationAddress}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {a.parent && <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">Sub job</span>}
                        {isSupervisor && <span className="text-xs text-gray-400">{a.branch.name}</span>}
                        {names && <span className="text-xs text-gray-400 lg:hidden truncate max-w-full" title={fullTeamNames || undefined}>{names}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[jobStatus].badge}`}>
                          {STATUS_CONFIG[jobStatus].label}
                        </span>
                        {pendingSos && (
                          <Link href={`/appointments/${a.id}`} className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">
                            <AlertTriangle className="w-3 h-3" /> SOS
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDate(a.date)}
                      <div className="text-xs text-gray-400">{a.time}{a.timeFinish ? `-${a.timeFinish}` : ""}</div>
                      <div className="mt-1 hidden text-xs text-gray-500 truncate lg:block" title={fullTeamNames || undefined}>{names || "No team"}</div>
                    </td>
                    <td className="px-4 py-3 text-left tabular-nums">
                      <div className="font-semibold text-blue-700 whitespace-nowrap">RM {a.totalPrice.toFixed(2)}</div>
                      {a.approvedAt && (
                        <span className="mt-1 flex items-center justify-start gap-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="w-3 h-3" /> Closed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{paymentType(a)}</td>
                    <td className="px-4 py-3">{paymentStatus(a)}</td>
                    <td className="pl-6 pr-4 py-3">{actions(a)}</td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No appointments found.</td></tr>
              )}
            </tbody>
          </table>
        </DesktopTable>

        <MobileCardList>
          {pageItems.map((a) => {
            const names = teamSummary(a);
            const fullTeamNames = teamNames(a);
            const jobStatus = deriveJobStatus(a);
            const pendingSos = hasPendingSos(a);
            return (
              <RecordCard key={a.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-xs font-medium text-blue-700">GP-{String(a.jobNo).padStart(4, "0")}</p>
                      {a.urgent && <UrgentTag />}
                    </div>
                    <h2 className="mt-1 font-semibold text-gray-900 break-words">{a.customer.name}</h2>
                    <p className="text-sm text-gray-500 break-words">{a.jobTitle || a.jobCategory?.name || "-"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[jobStatus].badge}`}>
                      {STATUS_CONFIG[jobStatus].label}
                    </span>
                    {pendingSos && (
                      <Link href={`/appointments/${a.id}`} className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
                        <AlertTriangle className="w-3 h-3" /> SOS
                      </Link>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <RecordMeta label="Date" value={formatDate(a.date)} />
                  <RecordMeta label="Time" value={<>{a.time}{a.timeFinish ? `-${a.timeFinish}` : ""}</>} />
                  <RecordMeta label="Team" value={<span title={fullTeamNames || undefined}>{names || <span className="text-gray-300">No team</span>}</span>} />
                  <RecordMeta label="Total" value={<span className="font-semibold tabular-nums text-blue-700">RM {a.totalPrice.toFixed(2)}</span>} />
                  {isSupervisor && <RecordMeta label="Branch" value={a.branch.name} />}
                  <RecordMeta label="Location" value={a.locationAddress} className={isSupervisor ? "" : "col-span-2"} />
                  <RecordMeta label="Payment Type" value={paymentType(a)} />
                  <RecordMeta label="Payment Status" value={paymentStatus(a)} />
                </div>
                {a.approvedAt && (
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                    <CheckCircle2 className="w-3 h-3" /> Closed
                  </span>
                )}
                <div className="mt-4 border-t border-gray-100 pt-3">{actions(a, true)}</div>
              </RecordCard>
            );
          })}
          {sorted.length === 0 && <EmptyList>No appointments found.</EmptyList>}
        </MobileCardList>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </ResponsiveListShell>

      <AppointmentModal open={modal} onClose={closeModal}
        onSaved={handleAppointmentSaved}
        categories={categories} customers={modalCustomers} teams={modalTeams}
        editing={editing}
        preselectedCustomerId={subJob?.customerId}
        parentId={subJob?.parentId}
        allowPastSchedule={canSchedulePastTime}
        canManageCompletion={canManageCompletion} />

      {popViewer && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPopViewer(null)}
        >
          <button
            type="button"
            aria-label="Close proof of payment viewer"
            onClick={() => setPopViewer(null)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-lg transition hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={popViewer}
            alt="Proof of payment full view"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
