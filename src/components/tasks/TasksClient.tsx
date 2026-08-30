"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, WifiOff, AlertCircle, CheckCircle2, ChevronRight, MapPin, Navigation, ExternalLink } from "lucide-react";
import { DesktopTable, EmptyList, MobileCardList, RecordCard, RecordMeta, ResponsiveListShell } from "@/components/ui/ResponsiveList";
import { usePagination, Pagination } from "@/components/ui/Pagination";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { UrgentTag } from "@/components/ui/UrgentTag";
import { inPeriod, type PeriodView } from "@/lib/period";
import { cacheTask, cacheTaskList, getCachedTaskList } from "@/lib/offline/idb";
import { OFFLINE_SYNC_COMPLETED_EVENT } from "@/lib/offline/client";
import { buildWazeLink } from "@/lib/waze";

interface Task {
  id: string;
  jobNo: number;
  jobTitle: string;
  date: string;
  time: string;
  timeFinish?: string | null;
  clockOutAt?: string | null;
  status: "COMING_SOON" | "IN_PROGRESS" | "DONE";
  urgent?: boolean;
  locationAddress: string;
  locationLat: number | null;
  locationLng: number | null;
  locationWazeLink: string;
  totalPrice: string;
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  customer: { name: string; phone: string; area: string };
  jobCategory: { name: string } | null;
  checkInCount: number;
  photoCount: number;
}

type TaskFilter = "ALL" | "COMING_SOON" | "IN_PROGRESS";

const TASK_FILTERS: Array<{ value: TaskFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "COMING_SOON", label: "Upcoming" },
  { value: "IN_PROGRESS", label: "In Progress" },
];

const TASK_REFRESH_INTERVAL_MS = 5000;
const OFFLINE_DETAIL_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const STATUS_CONFIG = {
  COMING_SOON: { label: "Upcoming", className: "bg-blue-100 text-blue-700" },
  IN_PROGRESS: { label: "In Progress", className: "bg-amber-100 text-amber-700" },
  DONE: { label: "Done", className: "bg-green-100 text-green-700" },
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

function taskTotalLabel(task: Pick<Task, "totalPrice">) {
  const total = Number(task.totalPrice) || 0;
  return total <= 0 ? "FOC" : `RM ${total.toFixed(2)}`;
}

export function TasksClient() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [period, setPeriod] = useState<{ view: PeriodView; cursor: Date }>({ view: "TODAY", cursor: new Date() });
  const [filter, setFilter] = useState<TaskFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState("");
  const preparedTaskIdsRef = useRef(new Map<string, number>());
  const preparedShellRef = useRef(false);
  const shellPrepareInFlightRef = useRef(false);

  const prepareTasksForOffline = useCallback(async (nextTasks: Task[]) => {
    const now = Date.now();
    const newTasks = nextTasks.filter((task) =>
      now - (preparedTaskIdsRef.current.get(task.id) ?? 0) >= OFFLINE_DETAIL_REFRESH_INTERVAL_MS
    );
    if (newTasks.length === 0 && preparedShellRef.current) return;

    const urls = ["/app/tasks", ...newTasks.map((task) => `/app/tasks/${task.id}`)];
    if ("serviceWorker" in navigator) {
      const message = {
        type: "CACHE_URLS",
        payload: { urlsToCache: urls },
      };
      const worker = navigator.serviceWorker.controller;
      if (worker) {
        worker.postMessage(message);
        preparedShellRef.current = true;
      } else if (!shellPrepareInFlightRef.current) {
        shellPrepareInFlightRef.current = true;
        void navigator.serviceWorker.ready.then((registration) => {
          registration.active?.postMessage(message);
          preparedShellRef.current = Boolean(registration.active);
        }).catch(() => undefined).finally(() => {
          shellPrepareInFlightRef.current = false;
        });
      }
    }

    await Promise.allSettled(newTasks.map(async (task) => {
      const response = await fetch(`/api/tasks/${task.id}`, { cache: "no-store" });
      if (!response.ok) return;
      await cacheTask(task.id, await response.json());
      preparedTaskIdsRef.current.set(task.id, Date.now());
    }));
  }, []);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!navigator.onLine) throw new Error("offline");
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data: Task[] = await res.json();
      setTasks(data);
      await cacheTaskList(data);
      void prepareTasksForOffline(data);
      setError("");
    } catch {
      const cached = await getCachedTaskList<Task[]>();
      if (cached) {
        setTasks(cached);
        setError("");
      } else if (!silent) {
        setError("Could not load tasks. Connect once to prepare this device for offline use.");
      }
    } finally {
      setLoading(false);
    }
  }, [prepareTasksForOffline]);

  /* eslint-disable react-hooks/set-state-in-effect -- initial task fetch and navigator sync run when the client view mounts */
  useEffect(() => {
    load();
    const refreshTimer = window.setInterval(() => {
      void load({ silent: true });
    }, TASK_REFRESH_INTERVAL_MS);
    const handleOnline = () => { setIsOnline(true); load({ silent: true }); };
    const handleOffline = () => setIsOnline(false);
    const handleSyncCompleted = () => { if (navigator.onLine) void load({ silent: true }); };
    setIsOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(OFFLINE_SYNC_COMPLETED_EVENT, handleSyncCompleted);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OFFLINE_SYNC_COMPLETED_EVENT, handleSyncCompleted);
    };
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredTasks = tasks
    .filter((task) => task.status !== "DONE")
    .filter((task) => inPeriod(task.date, period.view, period.cursor))
    .filter((task) => filter === "ALL" || task.status === filter)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.time.localeCompare(b.time));
  const { page, setPage, totalPages, total, pageSize, pageItems } = usePagination(filteredTasks, 10);
  const periodTasks = tasks
    .filter((task) => task.status !== "DONE")
    .filter((task) => inPeriod(task.date, period.view, period.cursor));
  const changePeriod = (next: { view: PeriodView; cursor: Date }) => {
    setPeriod(next);
    setPage(1);
  };
  const changeFilter = (next: TaskFilter) => {
    setFilter(next);
    setPage(1);
  };
  const openTask = (taskId: string) => {
    const href = `/app/tasks/${taskId}`;
    if (navigator.onLine) router.push(href);
    else window.location.assign(href);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PeriodNav view={period.view} cursor={period.cursor} onChange={changePeriod} />
      </div>

      <div className="flex justify-end">
        <div className="w-full sm:w-auto">
          <div className="hidden sm:flex w-fit rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {TASK_FILTERS.map((item) => (
              <button key={item.value} type="button" onClick={() => changeFilter(item.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                  filter === item.value ? "bg-[#28a89d] text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="sm:hidden">
            <select value={filter} onChange={(e) => changeFilter(e.target.value as TaskFilter)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {TASK_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-amber-800 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          You are offline. Task details are available from cache.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <ResponsiveListShell>
        <DesktopTable>
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 w-12">No.</th>
                <th className="px-4 py-3 w-24">ID</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3 w-40">Date &amp; Time</th>
                <th className="px-4 py-3 w-32">Status</th>
                <th className="px-4 py-3 w-32 text-right">Total</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((task, i) => {
                const cfg = STATUS_CONFIG[task.status];
                return (
                  <tr key={task.id} onClick={() => openTask(task.id)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-gray-400 tabular-nums">{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700 whitespace-nowrap">GP-{String(task.jobNo).padStart(4, "0")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base font-semibold text-gray-900 truncate">{task.jobTitle || task.jobCategory?.name || "-"}</span>
                        {task.urgent && <UrgentTag />}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{task.customer.name}</div>
                      <div className="mt-0.5 space-y-1">
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{task.locationAddress}</span>
                        </div>
                        {(buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink) && (
                          <a
                            href={buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-cyan-600 font-medium hover:underline"
                          >
                            <Navigation className="w-3 h-3" />
                            Open Waze
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDate(task.date)}
                      <div className="text-xs text-gray-400">{task.time}{task.timeFinish ? `-${task.timeFinish}` : ""}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
                        {task.status === "DONE" && <CheckCircle2 className="w-3 h-3" />}
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700 whitespace-nowrap">{taskTotalLabel(task)}</td>
                    <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-gray-400 inline" /></td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  {periodTasks.length === 0 ? "No tasks in this period." : `No ${TASK_FILTERS.find((i) => i.value === filter)?.label.toLowerCase()} tasks.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </DesktopTable>

        <MobileCardList>
          {pageItems.map((task) => {
            const cfg = STATUS_CONFIG[task.status];
            return (
              <RecordCard key={task.id} onClick={() => openTask(task.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-xs font-medium text-blue-700">GP-{String(task.jobNo).padStart(4, "0")}</p>
                      {task.urgent && <UrgentTag />}
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-gray-900 break-words">{task.jobTitle || task.jobCategory?.name || "-"}</h2>
                    <p className="text-sm text-gray-500 break-words">{task.customer.name}</p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.className}`}>
                    {task.status === "DONE" && <CheckCircle2 className="w-3 h-3" />}
                    {cfg.label}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <RecordMeta label="Date" value={formatDate(task.date)} />
                  <RecordMeta label="Time" value={<>{task.time}{task.timeFinish ? `-${task.timeFinish}` : ""}</>} />
                  <RecordMeta label="Total" value={<span className="font-semibold text-blue-700">{taskTotalLabel(task)}</span>} />
                  <RecordMeta label="Area" value={task.customer.area || <span className="text-gray-300">-</span>} />
                  <RecordMeta label="Location" value={task.locationAddress} className="col-span-2" />
                  <RecordMeta
                    label="Navigate"
                    value={
                      buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink ? (
                        <a
                          href={buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1 text-cyan-600 font-medium hover:underline"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          Open Waze
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )
                    }
                    className="col-span-2"
                  />
                </div>
              </RecordCard>
            );
          })}
          {filteredTasks.length === 0 && (
            <EmptyList>{periodTasks.length === 0 ? "No tasks in this period." : `No ${TASK_FILTERS.find((i) => i.value === filter)?.label.toLowerCase()} tasks.`}</EmptyList>
          )}
        </MobileCardList>
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </ResponsiveListShell>
    </div>
  );
}
