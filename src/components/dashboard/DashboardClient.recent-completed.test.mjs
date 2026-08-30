import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./DashboardClient.tsx", import.meta.url), "utf8");

test("recently completed shows job title before category details", () => {
  assert.match(source, /recentCompleted:\s*\{\s*id: string; jobTitle: string \| null; date: string; totalPrice: string;/);
  assert.match(source, /<p className="text-sm font-medium text-gray-800 truncate">\{a\.jobTitle \|\| a\.jobCategory\?\.name \|\| ".*?"\}<\/p>/s);
  assert.match(source, /<p className="text-sm text-gray-600 truncate">\{a\.customer\.name \|\| ".*?"\}<\/p>/s);
  assert.match(source, /<p className="text-xs text-gray-400">\s*\{a\.jobCategory\?\.name \?\? ".*?"\}\{a\.technician \? `.*?\$\{a\.technician\.name\}` : ""\}/s);
});

test("manager dashboard job list supports search and keeps the current scroll position after payment actions", () => {
  assert.match(source, /const \[jobSearch, setJobSearch\] = useState\(""\)/);
  assert.match(source, /const normalizedJobSearch = jobSearch\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /row\.customer\.name\.toLowerCase\(\)\.includes\(normalizedJobSearch\)/);
  assert.match(source, /row\.customer\.phone\.toLowerCase\(\)\.includes\(normalizedJobSearch\)/);
  assert.match(source, /row\.jobTitle\.toLowerCase\(\)\.includes\(normalizedJobSearch\)/);
  assert.match(source, /preserveWindowScroll\(\)/);
  assert.match(source, /const scrollY = window\.scrollY/);
  assert.match(source, /window\.scrollTo\(\{ top: scrollY/);
});

test("dashboard data fetch cannot leave the page spinning forever", () => {
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /window\.setTimeout\(\(\) => controller\.abort\(\), 15000\)/);
  assert.match(source, /fetch\(`\/api\/dashboard\?period=\$\{p\}&date=\$\{d\}\$\{teamQs\}`,\s*\{ signal: controller\.signal \}\)/);
  assert.match(source, /window\.clearTimeout\(timeout\)/);
});

test("dashboard initializes today's date from the local calendar day, not UTC", () => {
  assert.match(source, /function todayStr\(\) \{[\s\S]*getFullYear\(\)[\s\S]*getMonth\(\) \+ 1[\s\S]*getDate\(\)[\s\S]*\}/);
  assert.doesNotMatch(source, /function todayStr\(\) \{[^}]*toISOString\(\)\.slice\(0, 10\)/);
});

test("dashboard tracking map refreshes live without reloading every dashboard metric", () => {
  assert.match(source, /const TRACKING_POLL_MS = 5 \* 1000/);
  assert.match(source, /const fetchTracking = useCallback\(async \(\) => \{/);
  assert.match(source, /fetch\("\/api\/tracking\/teams",\s*\{[\s\S]*cache: "no-store"[\s\S]*signal: controller\.signal/);
  assert.match(source, /setData\(\(current\) => current \? \{ \.\.\.current, teamTracking: payload\.teamTracking! \} : current\)/);
  assert.match(source, /window\.setInterval\(refreshWhenVisible, TRACKING_POLL_MS\)/);
  assert.match(source, /window\.addEventListener\("focus", refreshWhenVisible\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
});

test("manager dashboard job search scans all periods while preserving branch team and status filters", () => {
  assert.match(source, /import \{ inPeriod, type PeriodView \} from "@\/lib\/period"/);
  assert.match(source, /const isJobSearching = normalizedJobSearch\.length > 0/);
  assert.match(source, /const jobPeriodView = PERIOD_TO_VIEW\[period\]/);
  assert.match(source, /const jobPeriodCursor = cursorFromDateParam\(period, dateParam\)/);
  assert.match(source, /\.filter\(\(j\) => isJobSearching \|\| inPeriod\(j\.date, jobPeriodView, jobPeriodCursor\)\)/);
  assert.match(source, /\.filter\(\(j\) => !activeBranch \|\| j\.branchId === activeBranch\.id\)/);
  assert.match(source, /\.filter\(\(j\) => selectedTeam === "ALL" \|\| j\.teamIds\.includes\(selectedTeam\)\)/);
  assert.match(source, /\.filter\(\(j\) => jobStatusFilter === "ALL" \|\| deriveJobStatus\(j\) === jobStatusFilter\)/);
});

test("dashboard commission total stays scoped to the selected period", () => {
  assert.match(source, /const statCommission = periodScopedJobs\s*\.reduce\(\(sum, j\) => sum \+ \(j\.commission \? Number\(j\.commission\) : 0\), 0\)/);
});

test("manager dashboard job list hides lower-priority columns before horizontal scrolling is needed", () => {
  assert.match(source, /className="px-2 py-2\.5 text-gray-600 whitespace-nowrap hidden 2xl:table-cell">\{row\.customer\.phone\}/);
  assert.match(source, /className="px-2 py-2\.5 whitespace-nowrap hidden 2xl:table-cell">/);
  assert.match(source, /className="px-2 py-2\.5 text-center whitespace-nowrap hidden 2xl:table-cell">/);
  assert.match(source, /className="px-2 py-2\.5 whitespace-nowrap w-px text-right hidden xl:table-cell">/);
});

test("dashboard header controls align with the title row", () => {
  assert.match(source, /<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">[\s\S]*<h1 className="text-2xl font-bold text-gray-900">Dashboard<\/h1>[\s\S]*Welcome back,[\s\S]*<select[\s\S]*<PeriodNav/);
  assert.match(source, /className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto lg:pt-0"/);
});

test("dashboard job list controls align with the job list title and use a wider search", () => {
  assert.match(source, /<div className="px-5 pt-5 pb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">[\s\S]*Job List[\s\S]*placeholder="Search customer, phone, or title"/);
  assert.match(source, /className="w-full sm:w-\[240px\] lg:w-\[320px\] xl:w-\[380px\] rounded-lg border border-gray-200/);
});

test("dashboard displays pending SOS check-in notification banner", () => {
  assert.match(source, /checkInSosCount: number/);
  assert.match(source, /data\.checkInSosCount > 0/);
  assert.match(source, /href="\/appointments\?sos=1"/);
  assert.match(source, /SOS Check-in/);
  assert.match(source, /Team needs help to check in/);
});

test("dashboard job list shows POP for office payments when a receipt photo exists", () => {
  assert.match(source, /const hasPop = !!row\.payment\?\.receiptPhotoUrl;/);
  assert.doesNotMatch(source, /row\.payment\?\.method === "QR_TRANSFER" \|\| row\.payment\?\.method === "CASH"/);
});
