"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, PlayCircle } from "lucide-react";
import { DesktopTable, EmptyList, MobileCardList, RecordCard, RecordMeta, ResponsiveListShell } from "@/components/ui/ResponsiveList";
import { usePagination, Pagination } from "@/components/ui/Pagination";
import { UrgentTag } from "@/components/ui/UrgentTag";
import { inPeriod, navigatePeriod, periodLabel, type PeriodView } from "@/lib/period";

interface TechTask {
  id: string; jobNo: number; jobTitle: string | null; customer: string; jobCategory: string | null;
  status: "COMING_SOON" | "IN_PROGRESS" | "DONE";
  urgent?: boolean;
  date: string; totalPrice: number; billingType: "CHARGEABLE" | "WARRANTY"; warrantyNote?: string | null;
}

interface Props {
  userName: string;
  tasks: TechTask[];
}

type TaskFilter = "ALL" | "COMING_SOON" | "IN_PROGRESS" | "DONE";

const CARDS = [
  { key: "total", label: "Total Tasks", icon: ClipboardList, color: "text-blue-600 bg-blue-50" },
  { key: "upcoming", label: "Upcoming", icon: CalendarClock, color: "text-indigo-600 bg-indigo-50" },
  { key: "inProgress", label: "In Progress", icon: PlayCircle, color: "text-amber-600 bg-amber-50" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-green-600 bg-green-50" },
  { key: "urgent", label: "Urgent", icon: AlertTriangle, color: "text-red-600 bg-red-50" },
] as const;

const PERIOD_FILTERS: Array<{ value: PeriodView; label: string }> = [
  { value: "TODAY", label: "Today" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

const TASK_FILTERS: Array<{ value: TaskFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "COMING_SOON", label: "Upcoming" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Completed" },
];

const STATUS_CONFIG = {
  COMING_SOON: { label: "Upcoming", className: "bg-blue-100 text-blue-700" },
  IN_PROGRESS: { label: "In Progress", className: "bg-amber-100 text-amber-700" },
  DONE: { label: "Completed", className: "bg-green-100 text-green-700" },
} as const;

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

function totalLabel(task: Pick<TechTask, "billingType" | "totalPrice">) {
  return task.billingType === "WARRANTY" ? "FOC" : `RM ${task.totalPrice.toFixed(2)}`;
}

export function TechnicianDashboard({ userName, tasks }: Props) {
  const [period, setPeriod] = useState<{ view: PeriodView; cursor: Date }>({ view: "TODAY", cursor: new Date() });
  const [filter, setFilter] = useState<TaskFilter>("ALL");
  const periodTasks = tasks.filter((task) => inPeriod(task.date, period.view, period.cursor));
  const stats = {
    total: periodTasks.length,
    upcoming: periodTasks.filter((task) => task.status === "COMING_SOON").length,
    inProgress: periodTasks.filter((task) => task.status === "IN_PROGRESS").length,
    completed: periodTasks.filter((task) => task.status === "DONE").length,
    urgent: periodTasks.filter((task) => task.urgent).length,
  };
  const filteredTasks = periodTasks
    .filter((task) => filter === "ALL" || task.status === filter)
    .sort((a, b) => b.jobNo - a.jobNo); // newest first
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filteredTasks, 10);
  const changePeriod = (next: { view: PeriodView; cursor: Date }) => {
    setPeriod(next);
    setPage(1);
  };
  const changeFilter = (next: TaskFilter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-gray-500">Welcome back, <span className="font-medium text-gray-800">{userName}</span>. Here is your team&apos;s task record.</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 bg-white px-1 py-1 shadow-sm">
            <button
              type="button"
              onClick={() => changePeriod({ view: period.view, cursor: navigatePeriod(period.view, period.cursor, -1) })}
              className="p-1.5 rounded-md hover:bg-gray-50 transition"
              aria-label="Previous period"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="px-2 text-sm font-semibold text-gray-800 whitespace-nowrap min-w-[10rem] text-center">
              {periodLabel(period.view, period.cursor)}
            </span>
            <button
              type="button"
              onClick={() => changePeriod({ view: period.view, cursor: navigatePeriod(period.view, period.cursor, 1) })}
              className="p-1.5 rounded-md hover:bg-gray-50 transition"
              aria-label="Next period"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {PERIOD_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => changePeriod({ view: item.value, cursor: item.value === "TODAY" ? new Date() : period.cursor })}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                  period.view === item.value ? "bg-[#151513] text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.color}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <p className="mt-3 text-2xl font-bold text-gray-900">{stats[c.key]}</p>
              <p className="text-xs text-gray-500">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Task List</h2>
            <span className="text-xs text-gray-400">{filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}</span>
          </div>
          <div>
            <div className="hidden sm:flex w-fit rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              {TASK_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => changeFilter(item.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                    filter === item.value ? "bg-[#151513] text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="sm:hidden">
              <select
                value={filter}
                onChange={(e) => changeFilter(e.target.value as TaskFilter)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TASK_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        {filteredTasks.length === 0 ? (
          <EmptyList>{periodTasks.length === 0 ? "No tasks in this period." : `No ${TASK_FILTERS.find((item) => item.value === filter)?.label.toLowerCase()} tasks.`}</EmptyList>
        ) : (
          <ResponsiveListShell>
            <DesktopTable>
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 w-12">No.</th>
                    <th className="px-4 py-3 w-24">ID</th>
                    <th className="px-4 py-3">Task</th>
                    <th className="px-4 py-3 w-36">Date</th>
                    <th className="px-4 py-3 w-32">Status</th>
                    <th className="px-4 py-3 w-36 text-right">Total</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageItems.map((r, i) => {
                    const cfg = STATUS_CONFIG[r.status];
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * pageSize + i + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700 whitespace-nowrap">GP-{String(r.jobNo).padStart(4, "0")}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-gray-900 truncate">{r.jobTitle || r.jobCategory || "-"}</span>
                            {r.urgent && <UrgentTag />}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{r.customer}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
                            {r.status === "DONE" && <CheckCircle2 className="w-3 h-3" />}
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-blue-700 whitespace-nowrap">{totalLabel(r)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/tasks/${r.id}`} className="text-xs font-medium text-blue-600 hover:underline">View</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DesktopTable>
            <MobileCardList>
              {pageItems.map((r) => {
                const cfg = STATUS_CONFIG[r.status];
                return (
                  <RecordCard key={r.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs font-medium text-blue-700">GP-{String(r.jobNo).padStart(4, "0")}</p>
                          {r.urgent && <UrgentTag />}
                        </div>
                        <h3 className="mt-1 font-semibold text-gray-900 break-words">{r.jobTitle || r.jobCategory || "-"}</h3>
                        <p className="text-sm text-gray-500">{r.customer}</p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.className}`}>
                        {r.status === "DONE" && <CheckCircle2 className="w-3 h-3" />}
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <RecordMeta label="Date" value={formatDate(r.date)} />
                      <RecordMeta label="Total" value={<span className="font-semibold text-blue-700">{totalLabel(r)}</span>} />
                    </div>
                    <div className="mt-4 border-t border-gray-100 pt-3 text-right">
                      <Link href={`/tasks/${r.id}`} className="text-sm font-medium text-blue-600 hover:underline">View</Link>
                    </div>
                  </RecordCard>
                );
              })}
            </MobileCardList>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
          </ResponsiveListShell>
        )}
      </div>
    </div>
  );
}
