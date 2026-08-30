// Shared "Today / Weekly / Monthly / Yearly" period model used by the schedule
// calendar and the appointment/customer list pages.

export type PeriodView = "TODAY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export const PERIOD_VIEWS: Array<{ value: PeriodView; label: string }> = [
  { value: "TODAY",   label: "Today"   },
  { value: "WEEKLY",  label: "Weekly"  },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY",  label: "Yearly"  },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

/** Monday-start week containing `d` (local time, midnight). */
export function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - (x.getDay() === 0 ? 6 : x.getDay() - 1));
  return x;
}

/** Inclusive `start`, exclusive `endExcl` range for the period around `cursor`. */
export function periodRange(view: PeriodView, cursor: Date): { start: Date; endExcl: Date } {
  const y = cursor.getFullYear(), m = cursor.getMonth(), d = cursor.getDate();
  if (view === "TODAY")  { const s = new Date(y, m, d);     return { start: s, endExcl: addDays(s, 1) }; }
  if (view === "WEEKLY") { const s = startOfWeek(cursor);   return { start: s, endExcl: addDays(s, 7) }; }
  if (view === "MONTHLY") return { start: new Date(y, m, 1), endExcl: new Date(y, m + 1, 1) };
  return { start: new Date(y, 0, 1), endExcl: new Date(y + 1, 0, 1) };
}

export function periodLabel(view: PeriodView, cursor: Date): string {
  if (view === "TODAY") {
    return cursor.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  }
  if (view === "WEEKLY") {
    const ws = startOfWeek(cursor);
    const we = addDays(ws, 6);
    return `${ws.getDate()} ${MONTHS_SHORT[ws.getMonth()]} – ${we.getDate()} ${MONTHS_SHORT[we.getMonth()]} ${we.getFullYear()}`;
  }
  if (view === "MONTHLY") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  return `${cursor.getFullYear()}`;
}

/** Move the cursor one period backwards (-1) or forwards (1) for the active view. */
export function navigatePeriod(view: PeriodView, cursor: Date, dir: -1 | 1): Date {
  if (view === "TODAY")  return addDays(cursor, dir);
  if (view === "WEEKLY") return addDays(cursor, dir * 7);
  if (view === "MONTHLY") return new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
  return new Date(cursor.getFullYear() + dir, cursor.getMonth(), 1);
}

/** Is the ISO date string within the period around `cursor`? */
export function inPeriod(dateISO: string, view: PeriodView, cursor: Date): boolean {
  const t = new Date(dateISO).getTime();
  const { start, endExcl } = periodRange(view, cursor);
  return t >= start.getTime() && t < endExcl.getTime();
}
