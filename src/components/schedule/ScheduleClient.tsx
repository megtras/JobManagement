"use client";

import { useEffect, useState } from "react";
import { X, MapPin, Navigation, Wrench, Clock, Tag, Pencil } from "lucide-react";
import { useBranchScope } from "@/components/layout/BranchScopeProvider";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { AppointmentModal } from "@/components/appointments/AppointmentModal";
import { UrgentTag } from "@/components/ui/UrgentTag";
import { type PeriodView, addDays, startOfWeek } from "@/lib/period";
import { buildWazeLink } from "@/lib/waze";

interface Branch { id: string; name: string }
interface Team { id: string; name: string; branchId: string; members: { id: string; name: string }[] }
interface Category { id: string; name: string; price: number }
interface CustomerAddress { id?: string; address: string; lat: number | null; lng: number | null }
interface CustomerOpt { id: string; name: string; phone: string; branchId: string; propertyType: string; status?: string; addresses: CustomerAddress[] }

interface Appointment {
  id: string;
  customerId: string;
  jobTitle: string;
  date: string; // ISO
  time: string;
  timeFinish: string;
  status: "COMING_SOON" | "IN_PROGRESS" | "DONE";
  urgent?: boolean;
  totalPrice: number;
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  branchId: string;
  jobCategoryId: string | null;
  locationAddress: string;
  locationLat: number | null;
  locationLng: number | null;
  locationWazeLink: string;
  customer: { name: string; phone: string };
  branch: { name: string };
  jobCategory: { name: string } | null;
  teams: Array<{ id: string; name: string; members: { name: string }[] }>;
  assets: Array<{ label: string }>;
}

interface Props {
  appointments: Appointment[];
  teams: Team[];
  categories: Category[];
  customers: CustomerOpt[];
  branches: Branch[];
  isSupervisor: boolean;
}

// ─── Color palette assigned by team index ──────────────────────────────────
const PALETTE = [
  { chip: "bg-blue-500 text-white",    legend: "bg-blue-500"    },
  { chip: "bg-emerald-500 text-white", legend: "bg-emerald-500" },
  { chip: "bg-violet-500 text-white",  legend: "bg-violet-500"  },
  { chip: "bg-amber-500 text-white",   legend: "bg-amber-500"   },
  { chip: "bg-rose-500 text-white",    legend: "bg-rose-500"    },
  { chip: "bg-cyan-600 text-white",    legend: "bg-cyan-600"    },
  { chip: "bg-orange-500 text-white",  legend: "bg-orange-500"  },
  { chip: "bg-indigo-500 text-white",  legend: "bg-indigo-500"  },
];

const STATUS_BADGE = {
  COMING_SOON: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  DONE:        "bg-green-100 text-green-700",
} as const;
const STATUS_LABEL = { COMING_SOON: "Coming Soon", IN_PROGRESS: "In Progress", DONE: "Done" } as const;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_MINI = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const offset = first === 0 ? 6 : first - 1; // Monday-start

  const days: Date[] = [];
  for (let i = offset - 1; i >= 0; i--) days.push(new Date(year, month - 1, daysInPrev - i));
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
  const rem = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= rem; i++) days.push(new Date(year, month + 1, i));
  return days;
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ScheduleClient({ appointments, teams, categories, customers, branches, isSupervisor }: Props) {
  const [view, setView] = useState<PeriodView>("TODAY");
  const [cursor, setCursor] = useState(() => new Date());
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "COMING_SOON" | "IN_PROGRESS" | "DONE">("ALL");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const { selectedBranchId } = useBranchScope();
  const branchFilterId = isSupervisor ? selectedBranchId : "ALL";

  // Open the full appointment editor straight from the calendar. The modal
  // refetches the complete record by id, so a lightweight draft is enough here.
  function openEdit(a: Appointment) {
    setSelected(null);
    setEditing(a);
  }

  // Teams a job can be filtered by — narrowed to the selected branch.
  const teamOptions = teams.filter((t) => branchFilterId === "ALL" || t.branchId === branchFilterId);
  // Teams belong to one branch, so reset the team when the global branch changes.
  useEffect(() => { setTeamFilter("ALL"); }, [branchFilterId]);

  // Colour every appointment by its (first) assigned team.
  const teamColorMap = Object.fromEntries(
    teams.map((t, i) => [t.id, PALETTE[i % PALETTE.length]])
  );

  const filtered = appointments
    .filter((a) => branchFilterId === "ALL" || a.branchId === branchFilterId)
    .filter((a) => teamFilter === "ALL" || a.teams.some((t) => t.id === teamFilter))
    .filter((a) => statusFilter === "ALL" || a.status === statusFilter);

  // Group by date key yyyy-mm-dd
  const byDate: Record<string, Appointment[]> = {};
  for (const a of filtered) {
    const key = a.date.slice(0, 10);
    (byDate[key] ??= []).push(a);
  }
  const dayAppts = (d: Date) =>
    [...(byDate[isoDate(d)] ?? [])].sort((a, b) => a.time.localeCompare(b.time));

  const todayKey = isoDate(new Date());
  const cursorYear = cursor.getFullYear();
  const cursorMonth = cursor.getMonth();

  // Reusable appointment chip (compact, coloured by team).
  const chip = (a: Appointment, opts?: { time?: boolean }) => {
    const team = a.teams[0];
    const color = team ? teamColorMap[team.id] : undefined;
    const teamNames = a.teams.map((t) => t.name).join(", ");
    const name = a.customer.name || a.customer.phone;
    return (
      <button key={a.id} onClick={() => setSelected(a)}
        className={`w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded leading-tight transition hover:opacity-90 ${color?.chip ?? "bg-gray-400 text-white"}`}>
        {opts?.time && <span className="block text-[9px] font-semibold opacity-90">{a.time}</span>}
        <span className="block truncate">{name}</span>
        {teamNames && <span className="block truncate font-normal opacity-90 text-[9px]">{teamNames}</span>}
      </button>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <PeriodNav view={view} cursor={cursor}
            onChange={({ view: v, cursor: c }) => { setView(v); setCursor(c); }} />
          <div className="flex flex-wrap items-center gap-2 lg:w-full lg:justify-end">
            {teamOptions.length > 0 && (
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Filter by team"
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="ALL">All Teams</option>
                {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-xs">
              {(["ALL", "COMING_SOON", "IN_PROGRESS", "DONE"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1.5 font-medium transition ${statusFilter === s ? "bg-[#28a89d] text-white" : "text-gray-600 hover:bg-gray-50"} ${s !== "ALL" ? "border-l border-gray-200" : ""}`}>
                  {s === "ALL" ? "All" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend — one colour per team */}
      {teams.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {teams.map((t, i) => (
            <div key={t.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`w-3 h-3 rounded-sm ${PALETTE[i % PALETTE.length].legend}`} />
              {t.name}
            </div>
          ))}
        </div>
      )}

      {/* ─── TODAY (day) view — one column per team, coloured ───────────────── */}
      {view === "TODAY" && (() => {
        const appts = dayAppts(cursor);
        if (appts.length === 0) {
          return (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="py-12 text-center text-sm text-gray-400">No appointments on this day.</p>
            </div>
          );
        }
        // A column for each team that has jobs today, plus an "Unassigned" column.
        // A job assigned to several teams appears under each of them.
        type Column = { id: string; name: string; color?: { chip: string; legend: string }; appts: Appointment[] };
        const columns: Column[] = [];
        for (const t of teams) {
          const teamAppts = appts.filter((a) => a.teams.some((x) => x.id === t.id));
          if (teamAppts.length > 0) columns.push({ id: t.id, name: t.name, color: teamColorMap[t.id], appts: teamAppts });
        }
        const unassigned = appts.filter((a) => a.teams.length === 0);
        if (unassigned.length > 0) columns.push({ id: "none", name: "No team assigned", appts: unassigned });

        return (
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3 min-w-min">
              {columns.map((col) => (
                <div key={col.id} className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col">
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
                    <span className={`w-3 h-3 rounded-sm shrink-0 ${col.color?.legend ?? "bg-gray-400"}`} />
                    <span className="font-semibold text-sm text-gray-800 truncate">{col.name}</span>
                    <span className="ml-auto text-xs text-gray-400">{col.appts.length}</span>
                  </div>
                  <div className="p-2 space-y-2">
                    {col.appts.map((a) => (
                      <button key={a.id} onClick={() => setSelected(a)}
                        className="w-full flex gap-2.5 border border-gray-200 rounded-lg p-2.5 hover:bg-gray-50 transition text-left">
                        <span className={`w-1.5 self-stretch rounded-full shrink-0 ${col.color?.legend ?? "bg-gray-400"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{a.time}{a.timeFinish ? `–${a.timeFinish}` : ""}</span>
                            <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_BADGE[a.status]}`}>
                              {STATUS_LABEL[a.status]}
                            </span>
                          </div>
                          <p className="mt-0.5 font-medium text-gray-900 truncate flex items-center gap-1.5">
                            <span className="truncate">{a.customer.name || a.customer.phone}</span>
                            {a.urgent && <UrgentTag />}
                          </p>
                          {a.jobTitle && <p className="text-xs font-medium text-gray-600 truncate">{a.jobTitle}</p>}
                          {a.locationAddress && <p className="text-xs text-gray-500 truncate">{a.locationAddress}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ─── WEEKLY view ──────────────────────────────────────────────────── */}
      {view === "WEEKLY" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div className="grid grid-cols-7 divide-x divide-gray-100 min-w-[700px]">
            {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((date) => {
              const key = isoDate(date);
              const isToday = key === todayKey;
              const appts = dayAppts(date);
              return (
                <div key={key} className="min-h-[420px] flex flex-col">
                  <div className={`py-2 text-center border-b border-gray-100 ${isToday ? "bg-blue-50" : ""}`}>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">{DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]}</p>
                    <p className={`text-sm font-semibold ${isToday ? "text-blue-600" : "text-gray-700"}`}>{date.getDate()}</p>
                  </div>
                  <div className="p-1.5 space-y-1">
                    {appts.map((a) => chip(a, { time: true }))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── MONTHLY view ─────────────────────────────────────────────────── */}
      {view === "MONTHLY" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAYS.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
            {buildGrid(cursorYear, cursorMonth).map((date, idx) => {
              const key = isoDate(date);
              const isCurrentMonth = date.getMonth() === cursorMonth;
              const isToday = key === todayKey;
              const appts = dayAppts(date);
              return (
                <div key={idx} className={`min-h-[90px] p-1.5 ${!isCurrentMonth ? "bg-gray-50/50" : ""}`}>
                  <button onClick={() => { setView("TODAY"); setCursor(new Date(date)); }}
                    className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full transition hover:bg-gray-100 ${
                      isToday ? "bg-[#28a89d] text-white hover:bg-[#1f8c82]" : isCurrentMonth ? "text-gray-700" : "text-gray-300"
                    }`}>
                    {date.getDate()}
                  </button>
                  <div className="space-y-0.5">
                    {appts.slice(0, 3).map((a) => chip(a))}
                    {appts.length > 3 && <p className="text-[10px] text-gray-400 pl-1">+{appts.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── YEARLY view ──────────────────────────────────────────────────── */}
      {view === "YEARLY" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MONTHS.map((mName, m) => (
            <div key={m} className="bg-white rounded-xl border border-gray-200 p-3">
              <button onClick={() => { setView("MONTHLY"); setCursor(new Date(cursorYear, m, 1)); }}
                className="text-sm font-semibold text-gray-800 mb-2 hover:text-blue-600 transition">
                {mName}
              </button>
              <div className="grid grid-cols-7 gap-0.5">
                {DAYS_MINI.map((d, i) => (
                  <div key={i} className="text-[8px] text-center text-gray-300 font-medium">{d}</div>
                ))}
                {buildGrid(cursorYear, m).map((date, idx) => {
                  const inMonth = date.getMonth() === m;
                  const key = isoDate(date);
                  const appts = byDate[key] ?? [];
                  const team = appts[0]?.teams[0];
                  const color = team ? teamColorMap[team.id] : undefined;
                  const isToday = key === todayKey;
                  return (
                    <button key={idx} onClick={() => { setView("TODAY"); setCursor(new Date(date)); }}
                      title={appts.length > 0 ? `${appts.length} appointment(s)` : undefined}
                      className={`aspect-square text-[9px] rounded flex items-center justify-center transition ${
                        !inMonth ? "text-gray-200"
                          : appts.length > 0 ? `${color?.chip ?? "bg-gray-400 text-white"} font-semibold`
                          : isToday ? "ring-1 ring-blue-500 text-blue-600"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}>
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Appointment detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-900">{selected.customer.name || selected.customer.phone}</p>
                <p className="text-sm text-gray-500">{selected.customer.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(selected)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#28a89d] hover:bg-[#1f8c82] text-white text-xs font-medium px-3 py-1.5 transition">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Status + branch */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[selected.status]}`}>
                  {STATUS_LABEL[selected.status]}
                </span>
                {selected.urgent && <UrgentTag />}
                <span className="text-xs text-gray-400">{selected.branch.name}</span>
              </div>

              {/* Category */}
              {selected.jobCategory && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Tag className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{selected.jobCategory.name}</span>
                </div>
              )}

              {/* Date + time */}
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <span>
                  {new Date(selected.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {" — "}{selected.time}{selected.timeFinish ? `–${selected.timeFinish}` : ""}
                </span>
              </div>

              {/* Teams + technicians */}
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <Wrench className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                {selected.teams.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {selected.teams.map((t) => (
                      <span key={t.id}>
                        <span className="font-medium">{t.name}</span>
                        {t.members.length > 0 && (
                          <span className="text-gray-400"> — {t.members.map((m) => m.name).join(", ")}</span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400">Not assigned</span>
                )}
              </div>

              {/* Location */}
              {selected.locationAddress && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">{selected.locationAddress}</p>
                    {(buildWazeLink(selected.locationAddress, selected.locationLat, selected.locationLng) || selected.locationWazeLink) && (
                      <a href={buildWazeLink(selected.locationAddress, selected.locationLat, selected.locationLng) || selected.locationWazeLink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-xs text-cyan-600 hover:text-cyan-800 font-medium">
                        <Navigation className="w-3 h-3" /> Open in Waze
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Assets */}
              {selected.assets.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Assets ({selected.assets.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.assets.map((a, i) => (
                      <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full">
                        {a.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-bold text-blue-700">{selected.billingType === "WARRANTY" ? "FOC" : `RM ${selected.totalPrice.toFixed(2)}`}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit appointment — opened from a calendar job */}
      <AppointmentModal
        open={!!editing}
        onClose={() => setEditing(null)}
        categories={categories}
        customers={customers}
        teams={teams}
        editing={editing ? {
          id: editing.id,
          customerId: editing.customerId,
          jobTitle: editing.jobTitle,
          date: editing.date,
          time: editing.time,
          timeFinish: editing.timeFinish,
          locationAddress: editing.locationAddress,
          locationLat: editing.locationLat,
          locationLng: editing.locationLng,
          teams: editing.teams.map((t) => ({ id: t.id })),
          status: editing.status,
          billingType: editing.billingType,
          warrantyNote: editing.warrantyNote,
          assets: editing.assets.map((x) => ({ label: x.label, additionalAddress: null })),
        } : null}
      />
    </div>
  );
}
