import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/overdue-tasks";
import { getTeamTracking } from "@/lib/team-tracking";
import { getServiceDueCustomerSummaries, notifyServiceDueCustomers } from "@/lib/service-due";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "today" | "weekly" | "monthly" | "yearly";

// ─── Slot definitions ─────────────────────────────────────────────────────────

const SLOTS: Record<Period, string[]> = {
  today:   ["6am", "10am", "2pm", "6pm"],
  weekly:  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  monthly: ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
  yearly:  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// ─── Date range from period + date param ─────────────────────────────────────

function getRange(period: Period, dateParam: string | null): { start: Date; end: Date; label: string } {
  const now = new Date();

  if (period === "today") {
    const d = dateParam ? new Date(dateParam) : now;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const label = start.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return { start, end, label };
  }

  if (period === "weekly") {
    const d   = dateParam ? new Date(dateParam) : now;
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    const fmt = (dt: Date) => dt.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
    return { start: mon, end: sun, label: `${fmt(mon)} – ${fmt(sun)} ${sun.getFullYear()}` };
  }

  if (period === "monthly") {
    const raw = dateParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [yr, mo] = raw.split("-").map(Number);
    const start = new Date(yr, mo - 1, 1);
    const end   = new Date(yr, mo, 0, 23, 59, 59, 999);
    const label = start.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
    return { start, end, label };
  }

  const year  = dateParam ? parseInt(dateParam) : now.getFullYear();
  const start = new Date(year, 0, 1);
  const end   = new Date(year, 11, 31, 23, 59, 59, 999);
  return { start, end, label: String(year) };
}

// ─── Slot assignment ─────────────────────────────────────────────────────────

function getSlot(period: Period, date: Date, timeStr?: string): string | null {
  if (period === "today") {
    const h = timeStr ? parseInt(timeStr.split(":")[0]) : date.getHours();
    if (h < 6)  return null;
    if (h < 10) return "6am";
    if (h < 14) return "10am";
    if (h < 18) return "2pm";
    return "6pm";
  }
  if (period === "weekly") {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  }
  if (period === "monthly") {
    const d = date.getDate();
    if (d <= 7)  return "Wk 1";
    if (d <= 14) return "Wk 2";
    if (d <= 21) return "Wk 3";
    return "Wk 4";
  }
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][date.getMonth()];
}

// ─── Main route ───────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isSupervisor = role === "SUPERVISOR";
  const branchFilter = !isSupervisor && branchId ? { branchId } : {};
  const managementScope = !isSupervisor && branchId ? { branchId } : {};
  await notifyServiceDueCustomers(managementScope);

  const { searchParams } = new URL(req.url);
  const period    = (searchParams.get("period") ?? "monthly") as Period;
  const dateParam = searchParams.get("date");
  const teamParam = searchParams.get("team");
  // When a team is selected, scope every appointment-based metric to that team.
  // (Customer metrics aren't team-owned, so they stay at branch/period level.)
  const teamFilter = teamParam ? { teams: { some: { id: teamParam } } } : {};

  const { start, end, label } = getRange(period, dateParam);
  const slots = SLOTS[period];

  // ── Branches ──────────────────────────────────────────────────────────────
  const branches = isSupervisor
    ? await prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const branchNames = branches.map((b) => b.name);

  // ── All queries in parallel ───────────────────────────────────────────────
  const [
    apptGroups,
    revenueSeries,
    customersInRange,
    completedInRange,
    techStats,
    recentAppts,
    branchAllAppts,
    branchRevenue,
    teamCount,
    branchTeamGroups,
    branchPeriodApptGroups,
    jobsTableData,
    teamTracking,
  ] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["status"],
      where: { ...branchFilter, ...teamFilter, date: { gte: start, lte: end } },
      _count: true,
    }),
    prisma.payment.findMany({
      where: {
        status: "APPROVED",
        appointment: { ...branchFilter, ...teamFilter, date: { gte: start, lte: end } },
      },
      select: {
        appointment: {
          select: {
            date: true,
            time: true,
            branchId: true,
            totalPrice: true,
            billingType: true,
            warrantyNote: true,
          },
        },
      },
    }),
    prisma.customer.findMany({
      where: { ...branchFilter, createdAt: { gte: start, lte: end } },
      select: { createdAt: true, status: true, branchId: true },
    }),
    prisma.appointment.findMany({
      where: { ...branchFilter, ...teamFilter, status: "DONE", date: { gte: start, lte: end } },
      select: { date: true, time: true, branchId: true },
    }),
    prisma.user.groupBy({
      by: ["technicianStatus"],
      where: { role: "TECHNICIAN", technicianStatus: { not: null }, ...(!isSupervisor && branchId ? { branchId } : {}) },
      _count: true,
    }),
    prisma.appointment.findMany({
      where: { ...branchFilter, ...teamFilter, status: "DONE" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true, jobTitle: true, date: true, totalPrice: true,
        customer: { select: { name: true } },
        teams: { select: { name: true } },
        jobCategory: { select: { name: true } },
      },
    }),
    isSupervisor
      ? prisma.appointment.findMany({ where: teamFilter, select: { branchId: true, status: true } })
      : Promise.resolve([] as { branchId: string; status: string }[]),
    isSupervisor
      ? prisma.payment.findMany({
          where: { status: "APPROVED", appointment: { date: { gte: start, lte: end } } },
          select: { appointment: { select: { branchId: true, totalPrice: true } } },
        })
      : Promise.resolve([] as { appointment: { branchId: string; totalPrice: unknown } }[]),
    // Team count (all teams in scope)
    prisma.team.count({
      where: !isSupervisor && branchId ? { branchId } : {},
    }),
    // Per-branch team counts (supervisor only)
    isSupervisor
      ? prisma.team.groupBy({
          by: ["branchId"],
          _count: true,
        })
      : Promise.resolve([] as { branchId: string | null; _count: number }[]),
    // Per-branch, period-filtered appointment status counts (supervisor only)
    isSupervisor
      ? prisma.appointment.groupBy({
          by: ["branchId", "status"],
          where: { ...teamFilter, date: { gte: start, lte: end } },
          _count: true,
        })
      : Promise.resolve([] as { branchId: string; status: string; _count: number }[]),
    // Jobs table data (all periods; the client applies period filtering unless searching)
    prisma.appointment.findMany({
      where: { ...branchFilter, ...teamFilter },
      orderBy: { date: "desc" },
      select: {
        id: true,
        jobNo: true,
        jobTitle: true,
        date: true,
        time: true,
        status: true,
        totalPrice: true,
        billingType: true,
        warrantyNote: true,
        commission: true,
        approvedAt: true,
        branchId: true,
        urgent: true,
        jobCategory: { select: { name: true } },
        customer: { select: { name: true, phone: true, area: true } },
        teams: { select: { id: true, name: true } },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, method: true, amount: true, receiptPhotoUrl: true, status: true },
        },
        clockInAt: true,
        clockOutAt: true,
      },
    }),
    getTeamTracking(role, branchId),
  ]);

  // ── Teams for the dashboard team filter (scoped to the viewer's branch) ─────
  const teamsList = await prisma.team.findMany({
    where: !isSupervisor && branchId ? { branchId } : {},
    select: { id: true, name: true, branchId: true },
    orderBy: { name: "asc" },
  });

  // Currently-flagged urgent tasks (branch + team scoped, not period-limited —
  // an urgent task should stay visible until a manager resolves it).
  const urgentCount = await prisma.appointment.count({
    where: { ...branchFilter, ...teamFilter, urgent: true },
  });
  const overdueCount = await prisma.appointment.count({
    where: {
      ...branchFilter,
      ...teamFilter,
      status: { in: ["COMING_SOON", "IN_PROGRESS"] },
      date: { lt: startOfToday() },
    },
  });
  const checkInSosCount = await prisma.appointment.count({
    where: {
      ...branchFilter,
      ...teamFilter,
      checkInSosRequestedAt: { not: null },
      checkInSosResolvedAt: null,
      checkIns: { none: {} },
    },
  });
  const serviceDueSummaries = await getServiceDueCustomerSummaries(managementScope);
  const serviceDueCountByBranch = serviceDueSummaries.reduce<Record<string, number>>((acc, summary) => {
    acc[summary.branchId] = (acc[summary.branchId] ?? 0) + 1;
    return acc;
  }, {});

  // ── Stat cards ────────────────────────────────────────────────────────────
  const statusMap = Object.fromEntries(apptGroups.map((s) => [s.status, s._count]));
  const closedCustomers = customersInRange.filter((c) => c.status === "CLOSED").length;
  const periodRevenue = revenueSeries.reduce((sum, payment) => sum + Number(payment.appointment.totalPrice), 0);

  const selectedPeriod = {
    period,
    label,
    totalJobs:      Object.values(statusMap).reduce((a, b) => a + b, 0),
    completedJobs:  statusMap["DONE"] ?? 0,
    inProgressJobs: statusMap["IN_PROGRESS"] ?? 0,
    pendingJobs:    statusMap["COMING_SOON"] ?? 0,
    newCustomers:   customersInRange.length,
    closedCustomers,
    revenue:        periodRevenue.toFixed(2),
    teamCount,
  };

  // ── Per-branch customer stats (supervisor) ────────────────────────────────
  const customersByBranch: Record<string, { total: number; closed: number }> = {};
  for (const c of customersInRange) {
    if (!customersByBranch[c.branchId]) customersByBranch[c.branchId] = { total: 0, closed: 0 };
    customersByBranch[c.branchId].total++;
    if (c.status === "CLOSED") customersByBranch[c.branchId].closed++;
  }

  // ── Per-branch period appointment status map (supervisor) ─────────────────
  const periodBranchStatusMap: Record<string, Record<string, number>> = {};
  for (const g of (branchPeriodApptGroups as { branchId: string; status: string; _count: number }[])) {
    if (!periodBranchStatusMap[g.branchId]) periodBranchStatusMap[g.branchId] = {};
    periodBranchStatusMap[g.branchId][g.status] = g._count;
  }

  // ── Per-branch team count map (supervisor) ────────────────────────────────
  const branchTeamCountMap: Record<string, number> = {};
  for (const g of (branchTeamGroups as { branchId: string | null; _count: number }[])) {
    if (g.branchId) branchTeamCountMap[g.branchId] = g._count;
  }

  // ── Deals chart ───────────────────────────────────────────────────────────
  const dealsMap: Record<string, Record<string, { closed: number; pending: number }>> = {};
  for (const s of slots) dealsMap[s] = {};

  for (const c of customersInRange) {
    const slot = getSlot(period, new Date(c.createdAt));
    if (!slot) continue;
    const bid = isSupervisor ? c.branchId : "single";
    if (!dealsMap[slot][bid]) dealsMap[slot][bid] = { closed: 0, pending: 0 };
    if (c.status === "CLOSED") dealsMap[slot][bid].closed++;
    else dealsMap[slot][bid].pending++;
  }

  const dealsChart: Record<string, string | number>[] = slots.map((slot) => {
    if (isSupervisor) {
      const row: Record<string, string | number> = { slot };
      for (const b of branches) {
        const d = dealsMap[slot][b.id] ?? { closed: 0, pending: 0 };
        row[`${b.name} Closed`]  = d.closed;
        row[`${b.name} Pending`] = d.pending;
      }
      return row;
    }
    const d = dealsMap[slot]["single"] ?? { closed: 0, pending: 0 };
    return { slot, Closed: d.closed, Pending: d.pending };
  });

  // ── Completed chart ───────────────────────────────────────────────────────
  const compMap: Record<string, Record<string, number>> = {};
  for (const s of slots) compMap[s] = {};

  for (const a of completedInRange) {
    const slot = getSlot(period, new Date(a.date), a.time);
    if (!slot) continue;
    const bid = isSupervisor ? a.branchId : "single";
    compMap[slot][bid] = (compMap[slot][bid] ?? 0) + 1;
  }

  const completedChart: Record<string, string | number>[] = slots.map((slot) => {
    if (isSupervisor) {
      const row: Record<string, string | number> = { slot };
      for (const b of branches) row[b.name] = compMap[slot][b.id] ?? 0;
      return row;
    }
    return { slot, Completed: compMap[slot]["single"] ?? 0 };
  });

  // —— Revenue chart ————————————————————————————————————————————————————————————————
  const revenueMap: Record<string, Record<string, number>> = {};
  for (const s of slots) revenueMap[s] = {};

  for (const payment of revenueSeries) {
    const slot = getSlot(period, new Date(payment.appointment.date), payment.appointment.time ?? undefined);
    if (!slot) continue;
    const bid = isSupervisor ? payment.appointment.branchId : "single";
    revenueMap[slot][bid] = (revenueMap[slot][bid] ?? 0) + Number(payment.appointment.totalPrice);
  }

  const revenueChart: Record<string, string | number>[] = slots.map((slot) => {
    if (isSupervisor) {
      const row: Record<string, string | number> = { slot };
      for (const b of branches) row[b.name] = Number((revenueMap[slot][b.id] ?? 0).toFixed(2));
      return row;
    }
    return { slot, Revenue: Number((revenueMap[slot]["single"] ?? 0).toFixed(2)) };
  });

  // ── Branch mini-cards ─────────────────────────────────────────────────────
  const branchStats = isSupervisor
    ? branches.map((b) => {
        const appts  = branchAllAppts.filter((a) => a.branchId === b.id);
        const rev    = branchRevenue
          .filter((p) => p.appointment.branchId === b.id)
          .reduce((s, p) => s + Number(p.appointment.totalPrice), 0);
        const psMap  = periodBranchStatusMap[b.id] ?? {};
        const custB  = customersByBranch[b.id] ?? { total: 0, closed: 0 };
        return {
          id: b.id, name: b.name,
          total:  appts.length,
          active: appts.filter((a) => a.status === "COMING_SOON" || a.status === "IN_PROGRESS").length,
          done:   appts.filter((a) => a.status === "DONE").length,
          // Period-specific counts
          periodTotal:      Object.values(psMap).reduce((a, c) => a + c, 0),
          periodCompleted:  psMap["DONE"] ?? 0,
          periodInProgress: psMap["IN_PROGRESS"] ?? 0,
          periodPending:    psMap["COMING_SOON"] ?? 0,
          newCustomers:     custB.total,
          closedCustomers:  custB.closed,
          teamCount:        branchTeamCountMap[b.id] ?? 0,
          serviceDueCount:  serviceDueCountByBranch[b.id] ?? 0,
          revenueThisPeriod: rev.toFixed(2),
        };
      })
    : [];

  // ── Jobs table ────────────────────────────────────────────────────────────
  const jobsTable = jobsTableData.map((a) => ({
    id:         a.id,
    jobNo:      a.jobNo,
    jobTitle:   a.jobTitle,
    date:       a.date.toISOString(),
    time:       a.time,
    status:     a.status as string,
    totalPrice: a.totalPrice.toString(),
    billingType: a.billingType,
    warrantyNote: a.warrantyNote,
    commission: a.commission?.toString() ?? null,
    approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
    branchId:   a.branchId,
    teamIds:    a.teams.map((t) => t.id),
    urgent:     a.urgent ?? false,
    jobCategory: a.jobCategory,
    customer:   a.customer,
    technician: a.teams.length > 0 ? { name: a.teams.map((t) => t.name).join(", ") } : null,
    payment:    a.payments[0]
      ? {
          id:             a.payments[0].id,
          method:         a.payments[0].method as string,
          amount:         a.payments[0].amount.toString(),
          receiptPhotoUrl: a.payments[0].receiptPhotoUrl,
          status:         a.payments[0].status as string,
        }
      : null,
    clockIn:  a.clockInAt ? a.clockInAt.toISOString() : null,
    clockOut: a.clockOutAt ? a.clockOutAt.toISOString() : null,
  }));

  return NextResponse.json({
    selectedPeriod,
    dealsChart,
    completedChart,
    revenueChart,
    branchNames,
    branchStats,
    teams: teamsList,
    urgentCount,
    overdueCount,
    checkInSosCount,
    serviceDueCount: serviceDueSummaries.length,
    technicians: techStats
      .filter((t) => t.technicianStatus !== null)
      .map((t) => ({ status: t.technicianStatus as string, count: t._count })),
    teamTracking,
    recentCompleted: recentAppts.map((a) => ({
      id: a.id,
      jobTitle: a.jobTitle,
      date: a.date,
      totalPrice: a.totalPrice.toString(),
      customer: a.customer,
      jobCategory: a.jobCategory,
      technician: a.teams.length > 0 ? { name: a.teams.map((t) => t.name).join(", ") } : null,
    })),
    jobsTable,
  });
}
