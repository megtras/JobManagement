"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PERIOD_VIEWS, type PeriodView, periodLabel, navigatePeriod } from "@/lib/period";

interface Props {
  view: PeriodView;
  cursor: Date;
  onChange: (next: { view: PeriodView; cursor: Date }) => void;
}

function sameCalendarDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarGridStart(month: Date) {
  const firstDay = monthStart(month);
  const mondayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);
  return start;
}

/** Previous/next range, clickable range label calendar, and period tabs. */
export function PeriodNav({ view, cursor, onChange }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCalendarMonth(monthStart(cursor));
  }, [cursor]);

  useEffect(() => {
    if (!calendarOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!calendarRef.current || calendarRef.current.contains(event.target as Node)) return;
      setCalendarOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [calendarOpen]);

  const calendarDays = useMemo(() => {
    const start = calendarGridStart(calendarMonth);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [calendarMonth]);

  const calendarMonthLabel = calendarMonth.toLocaleDateString("en-MY", {
    month: "long",
    year: "numeric",
  });

  function selectCalendarDate(date: Date) {
    onChange({ view, cursor: date });
    setCalendarMonth(monthStart(date));
    setCalendarOpen(false);
  }

  function moveCalendarMonth(offset: number) {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={calendarRef} className="relative flex items-center rounded-lg border border-gray-200 bg-white px-1 py-1 shadow-sm">
        <button type="button" onClick={() => onChange({ view, cursor: navigatePeriod(view, cursor, -1) })}
          className="p-1.5 rounded-md hover:bg-gray-50 transition" aria-label="Previous">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <button
          type="button"
          aria-label="Open calendar"
          onClick={() => setCalendarOpen((open) => !open)}
          className="px-2 text-sm font-semibold text-gray-800 whitespace-nowrap min-w-[10rem] text-center rounded-md hover:bg-gray-50 transition"
        >
          {periodLabel(view, cursor)}
        </button>
        <button type="button" onClick={() => onChange({ view, cursor: navigatePeriod(view, cursor, 1) })}
          className="p-1.5 rounded-md hover:bg-gray-50 transition" aria-label="Next">
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>

        {calendarOpen && (
          <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => moveCalendarMonth(-1)}
                className="rounded-md p-1.5 text-gray-600 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-semibold text-gray-900">{calendarMonthLabel}</div>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => moveCalendarMonth(1)}
                className="rounded-md p-1.5 text-gray-600 hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-semibold text-gray-400">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarDays.map((date) => {
                const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                const isSelected = sameCalendarDate(date, cursor);
                const isToday = sameCalendarDate(date, new Date());

                return (
                  <button
                    key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                    type="button"
                    onClick={() => selectCalendarDate(date)}
                    className={`h-9 rounded-lg text-sm transition ${
                      isSelected
                        ? "bg-[#151513] font-semibold text-white"
                        : isToday
                          ? "border border-[#F2B705] font-semibold text-[#151513]"
                          : isCurrentMonth
                            ? "text-gray-800 hover:bg-gray-50"
                            : "text-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
        {PERIOD_VIEWS.map((v) => (
          <button key={v.value} type="button"
            onClick={() => onChange({ view: v.value, cursor: v.value === "TODAY" ? new Date() : cursor })}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
              view === v.value ? "bg-[#151513] text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
