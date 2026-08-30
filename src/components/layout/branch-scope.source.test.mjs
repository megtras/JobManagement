import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function readSource(path) {
  const file = fileURLToPath(new URL(path, import.meta.url));
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const providerSource = readSource("./BranchScopeProvider.tsx");
const sidebarSource = readSource("./Sidebar.tsx");
const appLayoutSource = readSource("../../app/(application)/(system)/layout.tsx");

test("app layout provides supervisor branch scope to the whole shell", () => {
  assert.match(appLayoutSource, /import \{ getServerSession \} from "next-auth"/);
  assert.match(appLayoutSource, /import \{ getBranches \} from "@\/lib\/actions\/users"/);
  assert.match(appLayoutSource, /import \{ BranchScopeProvider \} from "@\/components\/layout\/BranchScopeProvider"/);
  assert.match(appLayoutSource, /const isSupervisor = session\?\.user\.role === "SUPERVISOR"/);
  assert.match(appLayoutSource, /const branches = isSupervisor \? await getBranches\(\) : \[\]/);
  assert.match(appLayoutSource, /<BranchScopeProvider branches=\{branches\} isSupervisor=\{isSupervisor\}>/);
});

test("branch scope provider persists the supervisor branch selection", () => {
  assert.match(providerSource, /"use client"/);
  assert.match(providerSource, /createContext/);
  assert.match(providerSource, /export function useBranchScope\(\)/);
  assert.match(providerSource, /const BRANCH_SCOPE_STORAGE_KEY = "genplusaircond\.supervisorBranchId"/);
  assert.match(providerSource, /window\.localStorage\.getItem\(BRANCH_SCOPE_STORAGE_KEY\)/);
  assert.match(providerSource, /window\.localStorage\.setItem\(BRANCH_SCOPE_STORAGE_KEY, next\)/);
});

test("sidebar renders a supervisor branch radio group from global branch scope", () => {
  assert.match(sidebarSource, /import \{ BranchScopeSelector \} from "\.\/BranchScopeProvider"/);
  assert.match(sidebarSource, /<BranchScopeSelector \/>/);
  assert.match(providerSource, /export function BranchScopeSelector\(\)/);
  assert.match(providerSource, /role="radiogroup"/);
  assert.match(providerSource, /role="radio"/);
  assert.match(providerSource, /All Branches/);
});
