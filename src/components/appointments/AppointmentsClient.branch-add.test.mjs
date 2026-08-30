import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const clientSource = readFileSync(new URL("./AppointmentsClient.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../app/(application)/(system)/appointments/page.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../../lib/actions/appointments.ts", import.meta.url), "utf8");

test("supervisor add button follows customer branch selection behavior", () => {
  assert.match(
    clientSource,
    /\{\(!isSupervisor \|\| branchFilterId !== "ALL"\) && \(/,
    "expected Add button to be hidden for supervisors until a branch is selected"
  );
  assert.match(clientSource, /min-w-\[104px\] justify-center/);
});

test("add appointment modal receives options scoped to selected branch", () => {
  assert.match(clientSource, /const modalBranchId = branchFilterId !== "ALL" \? branchFilterId : undefined/);
  assert.match(clientSource, /const modalCustomers = modalBranchId/);
  assert.match(clientSource, /customers\.filter\(\(c\) => c\.branchId === modalBranchId\)/);
  assert.match(clientSource, /const modalTeams = modalBranchId/);
  assert.match(clientSource, /teams\.filter\(\(t\) => t\.branchId === modalBranchId\)/);
  assert.match(clientSource, /customers=\{modalCustomers\}/);
  assert.match(clientSource, /teams=\{modalTeams\}/);
});

test("appointment modal close clears stale editing and sub-job state", () => {
  assert.match(clientSource, /function closeModal\(\) \{ setModal\(false\); setEditing\(null\); setSubJob\(null\); \}/);
  assert.match(clientSource, /onClose=\{closeModal\}/);
});

test("appointments page reveals a newly saved appointment after modal save", () => {
  assert.match(clientSource, /function handleAppointmentSaved\(saved\?: \{ date\?: string \}\)/);
  assert.match(clientSource, /setAppointmentFilter\("ALL"\)/);
  assert.match(clientSource, /setSearch\(""\)/);
  assert.match(clientSource, /setTeamFilter\("ALL"\)/);
  assert.match(clientSource, /if \(saved\?\.date\) setCursor\(new Date\(saved\.date\)\)/);
  assert.match(clientSource, /router\.refresh\(\)/);
  assert.match(clientSource, /onSaved=\{handleAppointmentSaved\}/);
});

test("appointment page provides teams for assignment", () => {
  assert.match(actionSource, /teams: \{ select: \{ id: true, name: true, members:/);
  assert.match(pageSource, /getTeams\(\)/);
  assert.match(pageSource, /teams=\{teams\}/);
});

test("appointments page can open in urgent-only mode from the dashboard", () => {
  assert.match(pageSource, /searchParams: Promise<\{\s*urgent\?: string;\s*overdue\?: string;\s*sos\?: string\s*\}>/);
  assert.match(pageSource, /const initialUrgentOnly = urgent === "1"/);
  assert.match(pageSource, /initialUrgentOnly=\{initialUrgentOnly\}/);
  assert.match(clientSource, /initialUrgentOnly\?: boolean;/);
  assert.match(clientSource, /initialSosOnly \? "SOS" : initialUrgentOnly \? "URGENT" : initialOverdueOnly \? "OVERDUE" : "ALL"/);
  assert.match(clientSource, /\.filter\(\(a\) => appointmentFilter !== "URGENT" \|\| !!a\.urgent\)/);
  assert.match(clientSource, /\.filter\(\(a\) => isSearching \|\| appointmentFilter === "URGENT" \|\| appointmentFilter === "OVERDUE" \|\| appointmentFilter === "SOS" \|\| inPeriod\(a\.date, view, cursor\)\)/);
});

test("appointments page can open in overdue-only mode from the dashboard", () => {
  assert.match(pageSource, /searchParams: Promise<\{\s*urgent\?: string;\s*overdue\?: string;\s*sos\?: string\s*\}>/);
  assert.match(pageSource, /const initialOverdueOnly = overdue === "1"/);
  assert.match(pageSource, /initialOverdueOnly=\{initialOverdueOnly\}/);
  assert.match(clientSource, /initialOverdueOnly\?: boolean;/);
  assert.match(clientSource, /function isOverdue\(a: AppointmentRow\)/);
  assert.match(clientSource, /\.filter\(\(a\) => appointmentFilter !== "OVERDUE" \|\| isOverdue\(a\)\)/);
  assert.match(clientSource, /\.filter\(\(a\) => isSearching \|\| appointmentFilter === "URGENT" \|\| appointmentFilter === "OVERDUE" \|\| appointmentFilter === "SOS" \|\| inPeriod\(a\.date, view, cursor\)\)/);
});

test("appointments page supports search and manager-only completion controls", () => {
  assert.match(pageSource, /const canManageCompletion = session!\.user\.role === "MANAGER" \|\| session!\.user\.role === "SUPERVISOR"/);
  assert.match(pageSource, /const canSchedulePastTime = session!\.user\.role === "ADMIN" \|\| session!\.user\.role === "MANAGER" \|\| session!\.user\.role === "SUPERVISOR"/);
  assert.match(pageSource, /canManageCompletion=\{canManageCompletion\}/);
  assert.match(pageSource, /canSchedulePastTime=\{canSchedulePastTime\}/);
  assert.match(clientSource, /canManageCompletion: boolean;/);
  assert.match(clientSource, /canSchedulePastTime: boolean;/);
  assert.match(clientSource, /const \[search, setSearch\] = useState\(""\)/);
  assert.match(clientSource, /const normalizedSearch = search\.trim\(\)\.toLowerCase\(\)/);
  assert.match(clientSource, /a\.customer\.name\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(clientSource, /a\.customer\.phone\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(clientSource, /a\.jobTitle\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(clientSource, /a\.locationAddress\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(clientSource, /canManageCompletion=\{canManageCompletion\}/);
  assert.match(clientSource, /allowPastSchedule=\{canSchedulePastTime\}/);
});

test("appointments search scans all periods while preserving other filters", () => {
  assert.match(clientSource, /const isSearching = normalizedSearch\.length > 0/);
  assert.match(clientSource, /\.filter\(\(a\) => isSearching \|\| appointmentFilter === "URGENT" \|\| appointmentFilter === "OVERDUE" \|\| appointmentFilter === "SOS" \|\| inPeriod\(a\.date, view, cursor\)\)/);
  assert.match(clientSource, /\.filter\(\(a\) => appointmentFilter === "ALL" \|\| appointmentFilter === "URGENT" \|\| appointmentFilter === "OVERDUE" \|\| appointmentFilter === "SOS" \|\| deriveJobStatus\(a\) === appointmentFilter\)/);
});

test("appointment summary boxes replace top filter tabs and control the table", () => {
  assert.match(clientSource, /type AppointmentFilter = "ALL" \| "COMING_SOON" \| "IN_PROGRESS" \| "DONE" \| "URGENT" \| "OVERDUE" \| "SOS"/);
  assert.match(clientSource, /const \[appointmentFilter, setAppointmentFilter\] = useState<AppointmentFilter>\(initialFilter\)/);
  assert.match(clientSource, /<StatBox label="Total Appointments"[\s\S]*onClick=\{\(\) => setAppointmentFilter\("ALL"\)\}/);
  assert.match(clientSource, /<StatBox label="Urgent Only"[\s\S]*onClick=\{\(\) => setAppointmentFilter\("URGENT"\)\}/);
  assert.match(clientSource, /<StatBox label="Overdue"[\s\S]*onClick=\{\(\) => setAppointmentFilter\("OVERDUE"\)\}/);
  assert.match(clientSource, /highlight=\{urgentCount > 0\}/);
  assert.match(clientSource, /highlight=\{overdueCount > 0\}/);
  assert.match(clientSource, /highlight \? highlightClass/);
  assert.match(clientSource, /grid-cols-2 md:grid-cols-3 xl:grid-cols-6/);
  assert.doesNotMatch(clientSource, /\(\["ALL", "COMING_SOON", "IN_PROGRESS", "DONE"\] as const\)\.map/);
});

test("appointment team filter sits to the left of the date navigation", () => {
  assert.match(clientSource, /\{teamOptions\.length > 0 && \([\s\S]*aria-label="Filter by team"[\s\S]*<PeriodNav view=\{view\} cursor=\{cursor\}/);
});

test("appointment search sits below the summary boxes above the table", () => {
  assert.match(clientSource, /grid-cols-2 md:grid-cols-3 xl:grid-cols-6[\s\S]*<StatBox label="Overdue"[\s\S]*<div className="mt-\[30px\] mb-4 flex justify-end">[\s\S]*placeholder="Search customer, phone, title, or location"[\s\S]*<ResponsiveListShell>/);
  assert.match(clientSource, /w-full sm:w-\[420px\] lg:w-\[520px\]/);
});

test("appointments page compresses multi-team labels so long team lists do not stretch the layout", () => {
  assert.match(clientSource, /function teamSummary\(a: AppointmentRow\)/);
  assert.match(clientSource, /const names = a\.teams\.map\(\(t\) => t\.name\)/);
  assert.match(clientSource, /if \(names\.length === 1\) return names\[0\]/);
  assert.match(clientSource, /return `\$\{names\[0\]\} \+\$\{names\.length - 1\} more`/);
  assert.match(clientSource, /title=\{fullTeamNames \|\| undefined\}/);
});
