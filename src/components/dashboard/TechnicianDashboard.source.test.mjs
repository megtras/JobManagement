import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./TechnicianDashboard.tsx", import.meta.url), "utf8");

test("technician dashboard is a client component when it uses pagination state", () => {
  assert.match(source, /usePagination/);
  assert.ok(source.trimStart().startsWith('"use client";'));
});

test("technician dashboard offers today, weekly, monthly, and yearly period filters", () => {
  assert.match(source, /useState<\{ view: PeriodView; cursor: Date \}>/);
  assert.match(source, /inPeriod\(task\.date, period\.view, period\.cursor\)/);
  assert.match(source, /label: "Today"/);
  assert.match(source, /label: "Weekly"/);
  assert.match(source, /label: "Monthly"/);
  assert.match(source, /label: "Yearly"/);
});

test("technician dashboard removes the completed value card", () => {
  assert.doesNotMatch(source, /Completed Value/);
  assert.doesNotMatch(source, /Wallet/);
  assert.doesNotMatch(source, /earnings/);
});

test("technician dashboard computes period stats from all technician tasks", () => {
  assert.match(source, /tasks: TechTask\[\]/);
  assert.match(source, /const periodTasks = tasks\.filter/);
  assert.match(source, /total: periodTasks\.length/);
  assert.match(source, /status === "COMING_SOON"/);
  assert.match(source, /status === "IN_PROGRESS"/);
  assert.match(source, /status === "DONE"/);
  assert.match(source, /urgent: periodTasks\.filter\(\(task\) => task\.urgent\)\.length/);
  assert.match(source, /\{ key: "urgent", label: "Urgent"/);
  assert.match(source, /AlertTriangle/);
});

test("technician dashboard task list has the same status filter as manager dashboard", () => {
  assert.match(source, /type TaskFilter = "ALL" \| "COMING_SOON" \| "IN_PROGRESS" \| "DONE"/);
  assert.match(source, /const TASK_FILTERS[\s\S]*= \[/);
  assert.match(source, /\{ value: "ALL", label: "All" \}/);
  assert.match(source, /\{ value: "COMING_SOON", label: "Upcoming" \}/);
  assert.match(source, /\{ value: "IN_PROGRESS", label: "In Progress" \}/);
  assert.match(source, /\{ value: "DONE", label: "Completed" \}/);
  assert.match(source, /const \[filter, setFilter\] = useState<TaskFilter>\("ALL"\)/);
  assert.match(source, /\.filter\(\(task\) => filter === "ALL" \|\| task\.status === filter\)/);
  assert.match(source, /onClick=\{\(\) => changeFilter\(item\.value\)\}/);
  assert.match(source, /<select[\s\S]*value=\{filter\}/);
});

test("technician dashboard list is not limited to completed tasks", () => {
  assert.match(source, /<h2 className="text-sm font-semibold text-gray-700">Task List<\/h2>/);
  assert.doesNotMatch(source, /<h2 className="text-sm font-semibold text-gray-700">Recently Completed<\/h2>/);
  assert.doesNotMatch(source, /const completedTasks = periodTasks\.filter/);
  assert.doesNotMatch(source, /No completed tasks yet\./);
});

test("technician dashboard task list shows job title above customer name", () => {
  assert.match(source, /jobTitle: string \| null/);
  assert.match(source, /<span className="font-medium text-gray-900 truncate">\{r\.jobTitle \|\| r\.jobCategory \|\| "-"\}<\/span>/);
  assert.match(source, /<div className="text-xs text-gray-500 truncate">\{r\.customer\}<\/div>/);
  assert.match(source, /<h3 className="mt-1 font-semibold text-gray-900 break-words">\{r\.jobTitle \|\| r\.jobCategory \|\| "-"\}<\/h3>/);
  assert.match(source, /<p className="text-sm text-gray-500">\{r\.customer\}<\/p>/);
});
