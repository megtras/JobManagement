import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./PeriodNav.tsx", import.meta.url), "utf8");

test("period nav date label opens a calendar dropdown below the field", () => {
  assert.match(source, /const \[calendarOpen, setCalendarOpen\] = useState\(false\)/);
  assert.match(source, /const \[calendarMonth, setCalendarMonth\] = useState\(\(\) => new Date\(cursor\.getFullYear\(\), cursor\.getMonth\(\), 1\)\)/);
  assert.match(source, /ref=\{calendarRef\}/);
  assert.match(source, /aria-label="Open calendar"/);
  assert.match(source, /setCalendarOpen\(\(open\) => !open\)/);
  assert.match(source, /\{calendarOpen && \(/);
  assert.match(source, /className="absolute left-0 top-full z-30 mt-2/);
});

test("calendar can select a date and still keeps period arrows and tabs intact", () => {
  assert.match(source, /function selectCalendarDate\(date: Date\)/);
  assert.match(source, /onChange\(\{ view, cursor: date \}\)/);
  assert.match(source, /setCalendarOpen\(false\)/);
  assert.match(source, /Array\.from\(\{ length: 42 \}/);
  assert.match(source, /calendarDays\.map\(\(date\) =>/);
  assert.match(source, /navigatePeriod\(view, cursor, -1\)/);
  assert.match(source, /navigatePeriod\(view, cursor, 1\)/);
  assert.match(source, /PERIOD_VIEWS\.map/);
});

test("calendar closes when clicking outside", () => {
  assert.match(source, /document\.addEventListener\("mousedown", handlePointerDown\)/);
  assert.match(source, /document\.removeEventListener\("mousedown", handlePointerDown\)/);
  assert.match(source, /calendarRef\.current\.contains\(event\.target as Node\)/);
});
