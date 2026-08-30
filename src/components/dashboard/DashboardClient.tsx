"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarDays, CheckCircle2, Users, TrendingUp,
  Loader2, AlertCircle, AlertTriangle, Wallet, Building2,
  Clock, PlayCircle, CalendarClock,
  Hourglass, UserCheck, Receipt, X, LayoutDashboard, FileText,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line, Cell,
} from "recharts";
import { EmptyList, RecordCard, RecordMeta } from "@/components/ui/ResponsiveList";
import { paginate, Pagination } from "@/components/ui/Pagination";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { UrgentTag } from "@/components/ui/UrgentTag";
import { useBranchScope } from "@/components/layout/BranchScopeProvider";
import { TrackingPanel, type TeamTrackingPoint } from "@/components/dashboard/TrackingMap";
import { inPeriod, type PeriodView } from "@/lib/period";
import { isPdfReceiptUrl } from "@/lib/receipt-files";
import { normalizeUploadUrl } from "@/lib/upload-urls";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Period = "today" | "weekly" | "monthly" | "yearly";
type PaymentMethodFilter = "ALL" | "QR_TRANSFER" | "CASH" | "OFFICE";

interface SelectedPeriod {
  period: Period;
  label: string;
  totalJobs: number;
  completedJobs: number;
  inProgressJobs: number;
  pendingJobs: number;
  newCustomers: number;
  closedCustomers: number;
  revenue: string;
  teamCount: number;
}

interface BranchStat {
  id: string; name: string;
  total: number; active: number; done: number;
  periodTotal: number; periodCompleted: number;
  periodInProgress: number; periodPending: number;
  newCustomers: number; closedCustomers: number;
  teamCount: number;
  serviceDueCount: number;
  revenueThisPeriod: string;
}

interface JobRow {
  id: string;
  jobNo: number;
  jobTitle: string;
  date: string;
  time: string;
  status: string;
  totalPrice: string;
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  commission: string | null;
  approvedAt: string | null;
  branchId: string;
  teamIds: string[];
  urgent?: boolean;
  jobCategory: { name: string } | null;
  customer: { name: string; phone: string; area: string };
  technician: { name: string } | null;
  payment: { id: string; method: string; amount: string; receiptPhotoUrl: string | null; status: string } | null;
  clockIn: string | null;
  clockOut: string | null;
}

interface DashboardData {
  selectedPeriod: SelectedPeriod;
  dealsChart: Record<string, string | number>[];
  completedChart: Record<string, string | number>[];
  revenueChart: Record<string, string | number>[];
  branchNames: string[];
  branchStats: BranchStat[];
  teams: { id: string; name: string; branchId: string }[];
  urgentCount: number;
  overdueCount: number;
  checkInSosCount: number;
  serviceDueCount: number;
  teamTracking: TeamTrackingPoint[];
  technicians: { status: string; count: number }[];
  recentCompleted: {
    id: string; jobTitle: string | null; date: string; totalPrice: string;
    customer: { name: string };
    technician: { name: string } | null;
    jobCategory: { name: string } | null;
  }[];
  jobsTable: JobRow[];
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BRANCH_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];
const CATEGORY_BAR_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2", "#db2777"];
const TRACKING_POLL_MS = 5 * 1000;

const STATUS_BADGE: Record<string, string> = {
  DONE:        "bg-green-100 text-green-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMING_SOON: "bg-amber-100 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  DONE:        "Completed",
  IN_PROGRESS: "In Progress",
  COMING_SOON: "Pending",
};

// Job status reflects progress:
//   Completed - once the payment has been approved (Yes).
//   In Progress - once the technician has started the task (clocked in).
//   Pending - before the technician has started.
function deriveJobStatus(row: { status?: string; clockIn: string | null; payment: { status: string } | null }): string {
  if (row.status === "DONE") return "DONE";
  if (row.payment?.status === "APPROVED") return "DONE";
  if (row.clockIn) return "IN_PROGRESS";
  return "COMING_SOON";
}

function isWarrantyJob(row: { billingType?: string }) {
  return row.billingType === "WARRANTY";
}

function totalDisplay(row: { billingType?: string; totalPrice: string }) {
  return isWarrantyJob(row) ? "FOC" : Number(row.totalPrice).toFixed(2);
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH:        "Cash",
  QR_TRANSFER: "QR/Bank",
  OFFICE:      "Office",
};

const CHART_STYLE = {
  tooltip: { contentStyle: { fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }, cursor: { fill: "#f9fafb" } },
  axis:    { fontSize: 11 },
};

// â”€â”€â”€ Date navigation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// The dashboard talks to its API in date strings; the shared PeriodNav works
// with a `view` enum + a Date cursor. Bridge the two so the dashboard can reuse
// the exact same filter control as the other pages.
const PERIOD_TO_VIEW: Record<Period, PeriodView> = {
  today: "TODAY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY",
};
const VIEW_TO_PERIOD: Record<PeriodView, Period> = {
  TODAY: "today", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly",
};

// dateParam string ("YYYY-MM-DD" day/week, "YYYY-MM" monthly, "YYYY" yearly) to Date.
function cursorFromDateParam(period: Period, dateParam: string): Date {
  const [y, mo, d] = dateParam.split("-").map(Number);
  if (period === "yearly")  return new Date(y, 0, 1);
  if (period === "monthly") return new Date(y, (mo ?? 1) - 1, 1);
  return new Date(y, (mo ?? 1) - 1, d ?? 1); // today / weekly
}

// Date cursor to dateParam string for the API.
function dateParamFromCursor(period: Period, c: Date): string {
  const mm = String(c.getMonth() + 1).padStart(2, "0");
  if (period === "yearly")  return String(c.getFullYear());
  if (period === "monthly") return `${c.getFullYear()}-${mm}`;
  return `${c.getFullYear()}-${mm}-${String(c.getDate()).padStart(2, "0")}`; // today / weekly
}

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

// â”€â”€â”€ Stat card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// â”€â”€â”€ Commission cell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CommissionCell({ id, initial, onSaved }: { id: string; initial: string | null; onSaved?: (value: string | null) => void }) {
  const [value, setValue]   = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef(initial ?? "");

  const save = useCallback(async () => {
    if (value === lastSaved.current) return;
    setSaving(true);
    try {
      await fetch(`/api/appointments/${id}/commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commission: value === "" ? null : value }),
      });
      lastSaved.current = value;
      onSaved?.(value === "" ? null : value); // let the parent recompute totals
    } finally {
      setSaving(false);
    }
  }, [id, value, onSaved]);

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-12 text-right border border-gray-200 rounded px-1 py-0.5 text-sm focus:outline-none focus:border-blue-400 bg-gray-50 focus:bg-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        step="0.01"
        min="0"
        placeholder="0.00"
      />
      {saving && <Loader2 className="w-3 h-3 animate-spin text-gray-400 shrink-0" />}
    </div>
  );
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function DashboardClient({ userName, isSupervisor }: {
  userName: string;
  isSupervisor: boolean;
}) {
  const [data, setData]             = useState<DashboardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [period, setPeriod]         = useState<Period>("today");
  const [dateParam, setDateParam]   = useState(todayStr);
  const [jobStatusFilter, setJobStatusFilter] = useState<"ALL" | "COMING_SOON" | "IN_PROGRESS" | "DONE">("ALL");
  const [jobCategoryFilter, setJobCategoryFilter] = useState<"ALL" | string>("ALL");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethodFilter>("ALL");
  const [selectedTeam, setSelectedTeam] = useState<"ALL" | string>("ALL");
  const [jobSearch, setJobSearch] = useState("");
  const [jobsPage, setJobsPage] = useState(1);
  const [popViewer, setPopViewer] = useState<string | null>(null);
  const normalizedJobSearch = jobSearch.trim().toLowerCase();
  const isJobSearching = normalizedJobSearch.length > 0;
  const { selectedBranchId, setSelectedBranchId } = useBranchScope();
  const selectedBranch = isSupervisor ? selectedBranchId : "ALL";

  function preserveWindowScroll() {
    if (typeof window === "undefined") return () => {};
    const scrollY = window.scrollY;
    return () => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    };
  }

  // When the global branch changes, drop the team selection (teams belong to one branch).
  useEffect(() => { setSelectedTeam("ALL"); }, [selectedBranch]);
  useEffect(() => {
    setJobsPage(1);
  }, [jobSearch, jobStatusFilter, jobCategoryFilter, paymentMethodFilter, selectedTeam, selectedBranch, period, dateParam]);

  const fetchData = useCallback(async (p: Period, d: string, team: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const teamQs = team !== "ALL" ? `&team=${encodeURIComponent(team)}` : "";
      const res = await fetch(`/api/dashboard?period=${p}&date=${d}${teamQs}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch {
      setError("Could not load dashboard.");
    } finally {
      window.clearTimeout(timeout);
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(period, dateParam, selectedTeam); }, [period, dateParam, selectedTeam, fetchData]);

  const fetchTracking = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("/api/tracking/teams", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return;
      const payload = await res.json() as { teamTracking?: TeamTrackingPoint[] };
      if (!Array.isArray(payload.teamTracking)) return;
      setData((current) => current ? { ...current, teamTracking: payload.teamTracking! } : current);
    } catch {
      // Keep existing dashboard data if the live tracking refresh misses once.
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (!data) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void fetchTracking();
    };

    refreshWhenVisible();
    const interval = window.setInterval(refreshWhenVisible, TRACKING_POLL_MS);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [Boolean(data), fetchTracking]);

  const [togglingPay, setTogglingPay] = useState<string | null>(null);
  const handleTogglePayment = async (paymentId: string) => {
    setTogglingPay(paymentId);
    try {
      const restoreScroll = preserveWindowScroll();
      const res = await fetch(`/api/payments/${paymentId}/toggle`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Toggle failed");
      await fetchData(period, dateParam, selectedTeam, { silent: true });
      restoreScroll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "An error occurred.");
    } finally {
      setTogglingPay(null);
    }
  };

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const handleApprove = async (id: string, customerName: string) => {
    if (!confirm(`Approve & close the job for "${customerName}"? This also approves the payment.`)) return;
    setApprovingId(id);
    try {
      const restoreScroll = preserveWindowScroll();
      const res = await fetch(`/api/appointments/${id}/approve`, { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Approve failed");
      await fetchData(period, dateParam, selectedTeam, { silent: true });
      restoreScroll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "An error occurred.");
    } finally {
      setApprovingId(null);
    }
  };

  // Switching tabs or stepping the arrows both flow through here: PeriodNav
  // hands back the next view + cursor, which we translate to the API's strings.
  const handlePeriodChange = ({ view: v, cursor: c }: { view: PeriodView; cursor: Date }) => {
    const p = VIEW_TO_PERIOD[v];
    setPeriod(p);
    setDateParam(dateParamFromCursor(p, c));
  };

  // Reflect an edited commission in the in-memory jobs so the Total Commission
  // card recomputes immediately, without a full refetch.
  const handleCommissionSaved = (jobId: string, commission: string | null) => {
    setData((d) => d ? { ...d, jobsTable: d.jobsTable.map((j) => j.id === jobId ? { ...j, commission } : j) } : d);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0" />{error || "No data."}
    </div>
  );

  const { selectedPeriod: sp, revenueChart, branchNames, branchStats } = data;
  const activeBranch  = isSupervisor && selectedBranch !== "ALL"
    ? branchStats.find((b) => b.id === selectedBranch) ?? null
    : null;
  const isAllBranches = isSupervisor && selectedBranch === "ALL";
  const showBranchBars = isAllBranches;
  const jobPeriodView = PERIOD_TO_VIEW[period];
  const jobPeriodCursor = cursorFromDateParam(period, dateParam);
  const scopedJobs = data.jobsTable
    .filter((j) => !activeBranch || j.branchId === activeBranch.id)
    .filter((j) => selectedTeam === "ALL" || j.teamIds.includes(selectedTeam));
  const jobCategoryOptions = Array.from(
    new Set(
      scopedJobs
        .map((j) => j.jobCategory?.name?.trim())
        .filter((name): name is string => Boolean(name))
    )
  ).sort((a, b) => a.localeCompare(b, "en"));
  const periodScopedJobs = scopedJobs.filter((j) => inPeriod(j.date, jobPeriodView, jobPeriodCursor));

  // â”€â”€ Stat values: use period-specific branch counts when a branch is selected â”€â”€
  const statTotalJobs      = activeBranch ? activeBranch.periodTotal      : sp.totalJobs;
  const statCompleted      = activeBranch ? activeBranch.periodCompleted  : sp.completedJobs;
  const statInProgress     = activeBranch ? activeBranch.periodInProgress : sp.inProgressJobs;
  const statPending        = activeBranch ? activeBranch.periodPending    : sp.pendingJobs;
  const statNewCustomers   = activeBranch ? activeBranch.newCustomers     : sp.newCustomers;
  const statClosedCustomers = activeBranch ? activeBranch.closedCustomers : sp.closedCustomers;
  const statServiceDueCount = activeBranch ? activeBranch.serviceDueCount : data.serviceDueCount;
  const statRevenue        = activeBranch ? activeBranch.revenueThisPeriod : sp.revenue;
  // Total commission stays period-scoped even though search can scan all jobs.
  const statCommission = periodScopedJobs
    .reduce((sum, j) => sum + (j.commission ? Number(j.commission) : 0), 0);

  // â”€â”€ Filter charts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filteredRevenue = activeBranch
    ? revenueChart.map((r) => ({
        slot: r.slot as string,
        Revenue: (r[activeBranch.name] ?? 0) as number,
      }))
    : revenueChart;

  // Teams available to pick â€” narrowed to the selected branch (supervisor view).
  const teamOptions = data.teams.filter((t) => !activeBranch || t.branchId === activeBranch.id);
  const trackingPoints = data.teamTracking.filter((point) =>
    (!activeBranch || point.branchId === activeBranch.id) &&
    (selectedTeam === "ALL" || point.role !== "TECHNICIAN" || point.teamIds.includes(selectedTeam))
  );
  const trackingLabel = selectedTeam !== "ALL"
    ? teamOptions.find((team) => team.id === selectedTeam)?.name ?? "Selected team"
    : activeBranch
      ? activeBranch.name
      : isAllBranches
        ? "All Branches"
        : "";

  // â”€â”€ Filter jobs table (by branch + team + job status) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filteredJobs = scopedJobs
    .filter((j) => isJobSearching || inPeriod(j.date, jobPeriodView, jobPeriodCursor))
    .filter((j) => jobCategoryFilter === "ALL" || (j.jobCategory?.name?.trim() || "Uncategorized") === jobCategoryFilter)
    .filter((j) => jobStatusFilter === "ALL" || deriveJobStatus(j) === jobStatusFilter)
    .filter((j) => paymentMethodFilter === "ALL" || j.payment?.method === paymentMethodFilter)
    .filter((row) => {
      if (!normalizedJobSearch) return true;
      return (
        row.customer.name.toLowerCase().includes(normalizedJobSearch)
        || row.customer.phone.toLowerCase().includes(normalizedJobSearch)
        || row.jobTitle.toLowerCase().includes(normalizedJobSearch)
      );
    })
    .sort((a, b) => b.jobNo - a.jobNo); // newest first
  const { page: jobsCurrentPage, totalPages: jobsTotalPages, total: jobsTotal, pageSize: jobsPageSize, pageItems: jobsPageItems } = paginate(filteredJobs, jobsPage, 10);

  const completedJobsByCategory = periodScopedJobs
    .filter((j) => j.status === "DONE")
    .reduce<Record<string, number>>((acc, job) => {
      const name = job.jobCategory?.name?.trim() || "Uncategorized";
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    }, {});
  const completedJobsByCategoryData = Object.entries(completedJobsByCategory)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))
    .map(([category, count]) => ({ category, count }));

  return (
    <div className="space-y-5">

      {/* â”€â”€â”€ Header controls â”€â”€â”€ */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          </div>
          <p className="mt-6 text-gray-500 text-sm">
            Welcome back, <span className="font-semibold text-gray-800">{userName}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto lg:pt-0">
          {teamOptions.length > 0 && (
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              aria-label="Filter by team"
              className="w-full sm:w-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Teams</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <PeriodNav
            view={PERIOD_TO_VIEW[period]}
            cursor={cursorFromDateParam(period, dateParam)}
            onChange={handlePeriodChange}
          />
        </div>
      </div>

      {data.overdueCount > 0 ? (
        <Link href="/appointments?overdue=1"
          className="mb-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300 hover:bg-amber-100/60">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
            <Hourglass className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-amber-700">Overdue Tasks</p>
            <p className="text-xl font-bold leading-tight text-amber-800">{data.overdueCount}</p>
          </div>
          <p className="ml-auto hidden text-xs font-medium text-amber-700 sm:block">Needs reschedule review</p>
        </Link>
      ) : (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-gray-400">
            <Hourglass className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Overdue Tasks</p>
            <p className="text-xl font-bold leading-tight text-gray-900">{data.overdueCount}</p>
          </div>
        </div>
      )}

      {statServiceDueCount > 0 ? (
        <Link href="/customers?serviceDue=1"
          className="mb-3 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 transition hover:border-teal-300 hover:bg-teal-100/60">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-teal-100 text-teal-700">
            <CalendarClock className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-teal-700">Service Due</p>
            <p className="text-xl font-bold leading-tight text-teal-800">{statServiceDueCount}</p>
          </div>
          <p className="ml-auto hidden text-xs font-medium text-teal-700 sm:block">Customers due for follow-up</p>
        </Link>
      ) : (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-gray-400">
            <CalendarClock className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Service Due</p>
            <p className="text-xl font-bold leading-tight text-gray-900">{statServiceDueCount}</p>
          </div>
        </div>
      )}

      {/* â”€â”€â”€ Urgent tasks (flagged by technicians, all-time) â”€â”€â”€ */}
      {data.checkInSosCount > 0 && (
        <Link href="/appointments?sos=1"
          className="mb-3 flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-4 transition hover:border-red-400 hover:bg-red-100/70">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-100 text-red-600">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-red-600">SOS Check-in</p>
            <p className="text-xl font-bold leading-tight text-red-700">{data.checkInSosCount}</p>
          </div>
          <p className="ml-auto hidden text-xs font-medium text-red-600 sm:block">Team needs help to check in</p>
        </Link>
      )}

      {data.urgentCount > 0 ? (
        <Link href="/appointments?urgent=1"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 transition hover:border-red-300 hover:bg-red-100/60">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-100 text-red-600">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-red-600">Urgent Tasks</p>
            <p className="text-xl font-bold leading-tight text-red-700">{data.urgentCount}</p>
          </div>
          <p className="ml-auto hidden text-xs font-medium text-red-600 sm:block">Flagged by technicians - needs review</p>
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-100 text-gray-400">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Urgent Tasks</p>
            <p className="text-xl font-bold leading-tight text-gray-900">{data.urgentCount}</p>
          </div>
        </div>
      )}

      {/* â”€â”€â”€ Stat cards â”€â”€â”€ */}
      <div>
        <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">
          {sp.label}{activeBranch ? ` - ${activeBranch.name}` : isAllBranches ? " - All Branches" : ""}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Jobs"    value={statTotalJobs}  icon={CalendarDays} color="bg-blue-100 text-blue-600"   />
          <StatCard label="Completed"     value={statCompleted}  icon={CheckCircle2} color="bg-green-100 text-green-600"  />
          <StatCard label="In Progress"   value={statInProgress} icon={PlayCircle}   color="bg-cyan-100 text-cyan-600"    />
          <StatCard label="Pending Jobs"  value={statPending}    icon={Hourglass}    color="bg-amber-100 text-amber-600"  />
          <StatCard
            label="New Customers"
            value={statNewCustomers}
            sub={`${statClosedCustomers} closed - ${statNewCustomers - statClosedCustomers} not closed`}
            icon={Users}
            color="bg-purple-100 text-purple-600"
          />
          <StatCard label="Closed Deals"  value={statClosedCustomers} icon={UserCheck}  color="bg-emerald-100 text-emerald-600" />
          <StatCard
            label="Revenue"
            value={`RM ${Number(statRevenue).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`}
            sub="Approved payments"
            icon={TrendingUp}
            color="bg-rose-100 text-rose-600"
          />
          <StatCard
            label="Total Commission"
            value={`RM ${statCommission.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`}
            icon={Wallet}
            color="bg-indigo-100 text-indigo-600"
          />
        </div>
      </div>

      {/* â”€â”€â”€ Charts â”€â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrackingPanel points={trackingPoints} label={trackingLabel} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800">Completed Jobs by Category</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">
            {sp.label}{activeBranch ? ` - ${activeBranch.name}` : isAllBranches ? " - All Branches" : ""}{selectedTeam !== "ALL" ? " - selected team" : ""}
          </p>
          {completedJobsByCategoryData.length === 0 ? (
            <p className="text-sm text-gray-400">No completed jobs yet for the current filters.</p>
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={completedJobsByCategoryData}
                  margin={{ top: 4, right: 12, bottom: 28, left: 0 }}
                  barGap={6}
                  barCategoryGap="26%"
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="category"
                    tick={CHART_STYLE.axis}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis allowDecimals={false} tick={CHART_STYLE.axis} axisLine={false} tickLine={false} width={24} />
                  <Tooltip {...CHART_STYLE.tooltip} />
                  <Bar dataKey="count" name="Completed Jobs" radius={[4, 4, 0, 0] as [number, number, number, number]}>
                    {completedJobsByCategoryData.map((_, index) => (
                      <Cell key={`category-bar-${index}`} fill={CATEGORY_BAR_COLORS[index % CATEGORY_BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800">Revenue Trend</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">
            Approved payments - {sp.label}{showBranchBars ? " - per branch" : ""}
          </p>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredRevenue as object[]} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="slot" tick={CHART_STYLE.axis} axisLine={false} tickLine={false} />
                <YAxis
                  tick={CHART_STYLE.axis}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(value) => `RM ${Number(value).toLocaleString("en-MY")}`}
                />
                <Tooltip
                  {...CHART_STYLE.tooltip}
                  formatter={(value) => [`RM ${Number(value).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`, "Revenue"]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {showBranchBars
                  ? branchNames.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        name={name}
                        stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))
                  : (
                    <Line
                      type="monotone"
                      dataKey="Revenue"
                      name="Revenue"
                      stroke="#ef4444"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* â”€â”€â”€ Branch mini-cards â”€â”€â”€ */}
      {isAllBranches && branchStats.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            Branch Overview (all time)
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {branchStats.map((b, i) => (
              <button
                key={b.id}
                onClick={() => setSelectedBranchId(b.id)}
                className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                  <p className="font-semibold text-gray-900 text-sm truncate">{b.name}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  {([["Total", b.total], ["Active", b.active], ["Done", b.done]] as [string, number][]).map(([lbl, val]) => (
                    <div key={lbl}>
                      <p className="text-lg font-bold text-gray-900">{val}</p>
                      <p className="text-xs text-gray-400">{lbl}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm font-semibold text-blue-700">
                  RM {Number(b.revenueThisPeriod).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  <span className="text-xs font-normal text-gray-400 ml-1">this period</span>
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* â”€â”€â”€ Jobs table â”€â”€â”€ */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 pt-5 pb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2 shrink-0">
            <Receipt className="w-4 h-4 text-gray-400 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-700 flex flex-wrap items-baseline gap-x-2">
              <span>Job List</span>
              <span className="text-xs font-normal text-gray-400">
                {sp.label}{activeBranch ? ` - ${activeBranch.name}` : ""}
                {" - "}{filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""}
              </span>
            </h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <input
              type="search"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Search customer, phone, or title"
              className="w-full sm:w-[240px] lg:w-[320px] xl:w-[380px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={jobCategoryFilter}
              onChange={(e) => setJobCategoryFilter(e.target.value)}
              aria-label="Filter job list by job category"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-48"
            >
              <option value="ALL">All Categories</option>
              {jobCategoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {/* Job status filter */}
            <div className="flex h-10 shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden text-sm w-fit">
              {([
                ["ALL", "All"], ["COMING_SOON", "Pending"], ["IN_PROGRESS", "In Progress"], ["DONE", "Completed"],
              ] as const).map(([value, label]) => (
                <button key={value} onClick={() => setJobStatusFilter(value)}
                  className={`px-2.5 sm:px-3 py-2 font-medium whitespace-nowrap transition ${jobStatusFilter === value ? "bg-[#28a89d] text-white" : "text-gray-600 hover:bg-gray-50"} ${value !== "ALL" ? "border-l border-gray-200" : ""}`}>
                  {label}
                </button>
              ))}
            </div>
            {/* Payment method filter */}
            <div
              role="group"
              aria-label="Filter job list by payment method"
              className="flex h-10 w-full shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm sm:w-fit"
            >
              {([
                ["ALL", "All Payments"],
                ["QR_TRANSFER", "QR"],
                ["CASH", "Cash"],
                ["OFFICE", "Office"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={paymentMethodFilter === value}
                  onClick={() => setPaymentMethodFilter(value)}
                  className={`flex-1 whitespace-nowrap px-2.5 py-2 font-medium transition sm:flex-none sm:px-3 ${
                    paymentMethodFilter === value
                      ? "bg-[#0f766e] text-white"
                      : "text-gray-600 hover:bg-teal-50 hover:text-teal-800"
                  } ${value !== "ALL" ? "border-l border-gray-200" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-gray-400">No jobs in this period.</p>
        ) : (
          <>
          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-t border-gray-100 bg-gray-50">
                  {[
                    "No.", "Job ID", "Cust Name", "HP Number", "Title",
                    "Clock In", "Clock Out", "Job Status",
                    "Total (RM)", "Payment", "POP",
                    "Pay Status", "Comm. RM", "Technician",
                  ].map((h) => (
                    <th
                      key={h}
                      className={`px-2 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap ${
                        h === "Total (RM)" || h === "Comm. RM" ? "text-right"
                          : h === "POP" || h === "Pay Status" ? "text-center"
                          : "text-left"
                      } ${
                        h === "HP Number" || h === "Clock In" || h === "Clock Out" || h === "POP" || h === "Pay Status"
                          ? "hidden 2xl:table-cell"
                          : h === "Comm. RM"
                            ? "hidden xl:table-cell"
                            : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobsPageItems.map((row, idx) => {
                  const jobStatus = deriveJobStatus(row);
                  const payApproved = row.payment?.status === "APPROVED";
                  const hasPop = !!row.payment?.receiptPhotoUrl;
                  const receiptUrl = hasPop ? normalizeUploadUrl(row.payment!.receiptPhotoUrl!) : "";
                  const isPdf = isPdfReceiptUrl(receiptUrl);
                  const warranty = isWarrantyJob(row);
                  return (
                  <tr
                    key={row.id}
                    className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                  >
                    {/* Running number */}
                    <td className="px-2 py-2.5 text-xs text-gray-400 tabular-nums whitespace-nowrap">{(jobsCurrentPage - 1) * jobsPageSize + idx + 1}</td>
                    {/* Job ID links to the appointment detail */}
                    <td className="px-2 py-2.5 font-mono text-xs font-medium whitespace-nowrap">
                      <Link href={`/appointments/${row.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline">
                        GP-{String(row.jobNo).padStart(4, "0")}
                      </Link>
                    </td>
                    {/* Cust Name */}
                    <td className="px-2 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">{row.customer.name}{row.urgent && <UrgentTag />}</span>
                    </td>
                    {/* HP Number */}
                    <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap hidden 2xl:table-cell">{row.customer.phone}</td>
                    {/* Title */}
                    <td className="px-2 py-2.5 text-gray-700 max-w-44 truncate" title={row.jobTitle}>
                      {row.jobTitle || "-"}
                    </td>
                    {/* Clock In */}
                    <td className="px-2 py-2.5 whitespace-nowrap hidden 2xl:table-cell">
                      <span className="flex items-center gap-1 text-gray-600">
                        <Clock className="w-3 h-3 text-gray-400" />
                        {fmtTime(row.clockIn)}
                      </span>
                    </td>
                    {/* Clock Out */}
                    <td className="px-2 py-2.5 whitespace-nowrap hidden 2xl:table-cell">
                      <span className="flex items-center gap-1 text-gray-600">
                        <Clock className="w-3 h-3 text-gray-400" />
                        {fmtTime(row.clockOut)}
                      </span>
                    </td>
                    {/* Job Status derived from check-in / check-out */}
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[jobStatus] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABEL[jobStatus] ?? jobStatus}
                        </span>
                        {row.approvedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                            <CheckCircle2 className="w-3 h-3" /> Closed
                          </span>
                        ) : jobStatus === "DONE" ? (
                          <button onClick={() => handleApprove(row.id, row.customer.name)} disabled={approvingId === row.id}
                            className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium px-2 py-0.5 rounded-md transition">
                            {approvingId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                            Approve
                          </button>
                        ) : null}
                      </div>
                    </td>
                    {/* Total Sales RM */}
                    <td className="px-2 py-2.5 text-right font-medium text-gray-800 whitespace-nowrap">
                      {totalDisplay(row)}
                    </td>
                    {/* Type of Payment */}
                    <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                      {warranty ? <span className="font-medium text-teal-700">Warranty</span> : row.payment ? (PAYMENT_METHOD_LABEL[row.payment.method] ?? row.payment.method) : "-"}
                    </td>
                    {/* POP proof of payment */}
                    <td className="px-2 py-2.5 text-center whitespace-nowrap hidden 2xl:table-cell">
                      {warranty ? (
                        <span className="text-gray-300">-</span>
                      ) : hasPop && isPdf ? (
                        <a
                          href={receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open PDF receipt"
                          className="inline-flex flex-col items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          <FileText className="h-8 w-8 rounded border border-gray-200 bg-blue-50 p-1.5 text-blue-600" />
                          <span className="text-xs underline">PDF</span>
                        </a>
                      ) : hasPop ? (
                        <button
                          type="button"
                          onClick={() => setPopViewer(receiptUrl)}
                          className="inline-flex flex-col items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          <img
                            src={receiptUrl}
                            alt="Proof of payment"
                            className="w-9 h-9 object-cover rounded border border-gray-200"
                          />
                          <span className="text-xs underline">View</span>
                        </button>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    {/* Payment Status Yes/No toggle */}
                    <td className="px-2 py-2.5 whitespace-nowrap text-center hidden 2xl:table-cell">
                      {warranty ? (
                        <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">Not Required</span>
                      ) : row.payment ? (
                        <span className="inline-flex rounded-full border border-gray-200 overflow-hidden text-xs font-semibold select-none">
                          <button
                            onClick={() => { if (!payApproved) handleTogglePayment(row.payment!.id); }}
                            disabled={togglingPay === row.payment.id}
                            title="Mark payment as received"
                            className={`px-2.5 py-1 transition disabled:opacity-60 ${payApproved ? "bg-green-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                          >
                            {togglingPay === row.payment.id && !payApproved ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
                          </button>
                          <button
                            onClick={() => { if (payApproved) handleTogglePayment(row.payment!.id); }}
                            disabled={togglingPay === row.payment.id}
                            title="Mark payment as not received"
                            className={`px-2.5 py-1 border-l border-gray-200 transition disabled:opacity-60 ${!payApproved ? "bg-red-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}
                          >
                            {togglingPay === row.payment.id && payApproved ? <Loader2 className="w-3 h-3 animate-spin" /> : "No"}
                          </button>
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    {/* Commission RM (Editable) */}
                    <td className="px-2 py-2.5 whitespace-nowrap w-px text-right hidden xl:table-cell">
                      <CommissionCell key={row.id} id={row.id} initial={row.commission} onSaved={(v) => handleCommissionSaved(row.id, v)} />
                    </td>
                    {/* Technician */}
                    <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">
                      {row.technician?.name ?? <span className="text-gray-300">-</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-3 space-y-3 xl:hidden">
            {jobsPageItems.map((row) => {
              const jobStatus = deriveJobStatus(row);
              const payApproved = row.payment?.status === "APPROVED";
              const hasPop = !!row.payment?.receiptPhotoUrl;
              const receiptUrl = hasPop ? normalizeUploadUrl(row.payment!.receiptPhotoUrl!) : "";
              const isPdf = isPdfReceiptUrl(receiptUrl);
              const warranty = isWarrantyJob(row);
              return (
                <RecordCard key={row.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/appointments/${row.id}`} className="font-mono text-xs font-medium text-blue-600 hover:underline">
                          GP-{String(row.jobNo).padStart(4, "0")}
                        </Link>
                        {row.urgent && <UrgentTag />}
                      </div>
                      <h3 className="mt-1 font-semibold text-gray-900 break-words">{row.customer.name}</h3>
                      <p className="text-sm text-gray-500">{row.customer.phone}</p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[jobStatus] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABEL[jobStatus] ?? jobStatus}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <RecordMeta label="Title" value={row.jobTitle || <span className="text-gray-300">-</span>} className="col-span-2" />
                    <RecordMeta label="Clock In" value={fmtTime(row.clockIn)} />
                    <RecordMeta label="Clock Out" value={fmtTime(row.clockOut)} />
                    <RecordMeta label="Total" value={<span className="font-semibold text-blue-700">{warranty ? "FOC" : `RM ${Number(row.totalPrice).toFixed(2)}`}</span>} />
                    <RecordMeta label="Commission" value={<CommissionCell key={row.id} id={row.id} initial={row.commission} onSaved={(v) => handleCommissionSaved(row.id, v)} />} />
                    <RecordMeta label="Technician" value={row.technician?.name ?? <span className="text-gray-300">-</span>} />
                    <RecordMeta label="Payment" value={
                      warranty ? (
                        <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">Warranty - Not Required</span>
                      ) : row.payment ? (
                        <span className="space-y-2">
                          <span className="block">{PAYMENT_METHOD_LABEL[row.payment.method] ?? row.payment.method}</span>
                          <span className="inline-flex rounded-full border border-gray-200 overflow-hidden text-xs font-semibold select-none">
                            <button onClick={() => { if (!payApproved) handleTogglePayment(row.payment!.id); }}
                              disabled={togglingPay === row.payment.id}
                              className={`px-2.5 py-1 transition disabled:opacity-60 ${payApproved ? "bg-green-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
                              {togglingPay === row.payment.id && !payApproved ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
                            </button>
                            <button onClick={() => { if (payApproved) handleTogglePayment(row.payment!.id); }}
                              disabled={togglingPay === row.payment.id}
                              className={`px-2.5 py-1 border-l border-gray-200 transition disabled:opacity-60 ${!payApproved ? "bg-red-500 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
                              {togglingPay === row.payment.id && payApproved ? <Loader2 className="w-3 h-3 animate-spin" /> : "No"}
                            </button>
                          </span>
                          {hasPop && isPdf && (
                            <a
                              href={receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open PDF receipt"
                              className="block text-xs font-medium text-blue-600 hover:underline"
                            >
                              View POP PDF
                            </a>
                          )}
                          {hasPop && !isPdf && (
                            <button
                              type="button"
                              onClick={() => setPopViewer(receiptUrl)}
                              className="block text-xs font-medium text-blue-600 hover:underline"
                            >
                              View POP
                            </button>
                          )}
                        </span>
                      ) : <span className="text-gray-300">-</span>
                    } />
                  </div>
                  {row.approvedAt ? (
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                      <CheckCircle2 className="w-3 h-3" /> Closed
                    </span>
                  ) : jobStatus === "DONE" ? (
                    <button onClick={() => handleApprove(row.id, row.customer.name)} disabled={approvingId === row.id}
                      className="mt-3 inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium px-2.5 py-1 rounded-md transition">
                      {approvingId === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Approve
                    </button>
                  ) : null}
                </RecordCard>
              );
            })}
          </div>
          <div className="px-3 pb-3 md:px-5 md:pb-5">
            <Pagination page={jobsCurrentPage} totalPages={jobsTotalPages} total={jobsTotal} pageSize={jobsPageSize} onChange={setJobsPage} />
          </div>
          </>
        )}
      </div>

      {/* â”€â”€â”€ Recently completed â”€â”€â”€ */}
      {data.recentCompleted.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Recently Completed</h2>
          <div className="space-y-3">
            {data.recentCompleted.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{a.jobTitle || a.jobCategory?.name || "-"}</p>
                  <p className="text-sm text-gray-600 truncate">{a.customer.name || "-"}</p>
                  <p className="text-xs text-gray-400">
                    {a.jobCategory?.name ?? "-"}{a.technician ? ` - ${a.technician.name}` : ""}
                    {" - "}{new Date(a.date).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-700 shrink-0">
                  RM {Number(a.totalPrice).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
    </div>
  );
}
