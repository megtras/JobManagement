import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./TasksClient.tsx", import.meta.url), "utf8");

test("technician tasks expose only active-work status filters with All as the default", () => {
  assert.match(source, /type TaskFilter = "ALL" \| "COMING_SOON" \| "IN_PROGRESS"/);
  assert.match(source, /const TASK_FILTERS[\s\S]*= \[/);
  assert.match(source, /\{ value: "ALL", label: "All" \}/);
  assert.match(source, /\{ value: "COMING_SOON", label: "Upcoming" \}/);
  assert.match(source, /\{ value: "IN_PROGRESS", label: "In Progress" \}/);
  assert.doesNotMatch(source, /\{ value: "DONE", label: "Completed" \}/);
  assert.match(source, /const \[filter, setFilter\] = useState<TaskFilter>\("ALL"\)/);
});

test("desktop uses segmented buttons while mobile uses a dropdown", () => {
  assert.match(source, /className="hidden sm:flex/);
  assert.match(source, /TASK_FILTERS\.map\(\(item\) => \(/);
  assert.match(source, /onClick=\{\(\) => changeFilter\(item\.value\)\}/);
  assert.match(source, /className="sm:hidden/);
  assert.match(source, /<select[\s\S]*value=\{filter\}/);
  assert.match(source, /onChange=\{\(e\) => changeFilter\(e\.target\.value as TaskFilter\)\}/);
});

test("task list filters by selected period first, then status", () => {
  assert.match(source, /import \{ PeriodNav \} from "@\/components\/ui\/PeriodNav"/);
  assert.match(source, /import \{ inPeriod, type PeriodView \} from "@\/lib\/period"/);
  assert.match(source, /const \[period, setPeriod\] = useState<\{ view: PeriodView; cursor: Date \}>/);
  assert.match(source, /<PeriodNav view=\{period\.view\} cursor=\{period\.cursor\} onChange=\{changePeriod\} \/>/);
  assert.match(source, /const filteredTasks = tasks/);
  assert.match(source, /\.filter\(\(task\) => task\.status !== "DONE"\)/);
  assert.match(source, /\.filter\(\(task\) => inPeriod\(task\.date, period\.view, period\.cursor\)\)/);
  assert.match(source, /\.filter\(\(task\) => filter === "ALL" \|\| task\.status === filter\)/);
});

test("overdue open technician work is not injected into every selected period", () => {
  assert.doesNotMatch(source, /function isOpenWork\(task: Task\)/);
  assert.doesNotMatch(source, /isOpenWork\(task\) \|\| inPeriod/);
  assert.match(source, /const periodTasks = tasks\s*\.filter\(\(task\) => task\.status !== "DONE"\)\s*\.filter\(\(task\) => inPeriod\(task\.date, period\.view, period\.cursor\)\)/);
});

test("period and status filter controls are aligned to the right", () => {
  assert.match(source, /<div className="flex justify-end">\s*<PeriodNav view=\{period\.view\} cursor=\{period\.cursor\} onChange=\{changePeriod\} \/>/);
  assert.match(source, /<div className="flex justify-end">\s*<div className="w-full sm:w-auto">/);
});

test("pagination hook runs before loading early return to keep hook order stable", () => {
  const paginationIndex = source.indexOf("usePagination(filteredTasks, 10)");
  const loadingReturnIndex = source.indexOf("if (loading)");

  assert.notEqual(paginationIndex, -1);
  assert.notEqual(loadingReturnIndex, -1);
  assert.ok(paginationIndex < loadingReturnIndex);
});

test("task list is rendered as a table with a Job ID column and row navigation", () => {
  assert.match(source, /<table/);
  assert.match(source, />ID</);
  assert.match(source, /GP-\{String\(task\.jobNo\)\.padStart\(4, "0"\)\}/);
  assert.match(source, /const href = `\/app\/tasks\/\$\{taskId\}`/);
  assert.match(source, /onClick=\{\(\) => openTask\(task\.id\)\}/);
});

test("team task list shows job title first and customer name underneath", () => {
  assert.match(source, /jobTitle: string/);
  assert.match(source, /<span className="text-base font-semibold text-gray-900 truncate">\{task\.jobTitle \|\| task\.jobCategory\?\.name \|\| "-"\}<\/span>/);
  assert.match(source, /<div className="text-xs text-gray-500 truncate">\{task\.customer\.name\}<\/div>/);
  assert.match(source, /<h2 className="mt-1 text-lg font-semibold text-gray-900 break-words">\{task\.jobTitle \|\| task\.jobCategory\?\.name \|\| "-"\}<\/h2>/);
  assert.match(source, /<p className="text-sm text-gray-500 break-words">\{task\.customer\.name\}<\/p>/);
});

test("team task list shows address and Waze links on both desktop and mobile layouts", () => {
  assert.match(source, /locationWazeLink: string/);
  assert.match(source, /buildWazeLink/);
  assert.match(source, /<span className="truncate">\{task\.locationAddress\}<\/span>/);
  assert.match(source, /href=\{buildWazeLink\(task\.locationAddress, task\.locationLat, task\.locationLng\) \|\| task\.locationWazeLink\}/);
  assert.match(source, /Open Waze/);
  assert.match(source, /RecordMeta label="Location" value=\{task\.locationAddress\} className="col-span-2"/);
  assert.match(source, /RecordMeta[\s\S]*label="Navigate"[\s\S]*href=\{buildWazeLink\(task\.locationAddress, task\.locationLat, task\.locationLng\) \|\| task\.locationWazeLink\}/);
});

test("team task list displays FOC from zero chargeable total", () => {
  assert.match(source, /function taskTotalLabel\(task: Pick<Task, "totalPrice">\)/);
  assert.match(source, /const total = Number\(task\.totalPrice\) \|\| 0/);
  assert.match(source, /return total <= 0 \? "FOC" : `RM \$\{total\.toFixed\(2\)\}`/);
});

test("team task list auto-refreshes active tasks without a page reload", () => {
  assert.match(source, /const TASK_REFRESH_INTERVAL_MS = 5000/);
  assert.match(source, /fetch\("\/api\/tasks", \{ cache: "no-store" \}\)/);
  assert.match(source, /window\.setInterval\(\(\) => \{\s*void load\(\{ silent: true \}\);\s*\}, TASK_REFRESH_INTERVAL_MS\)/);
  assert.match(source, /window\.clearInterval\(refreshTimer\)/);
  assert.doesNotMatch(source, /router\.refresh\(\)/);
});
