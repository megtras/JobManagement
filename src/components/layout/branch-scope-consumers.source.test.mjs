import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const consumers = [
  "../appointments/AppointmentsClient.tsx",
  "../customers/CustomersClient.tsx",
  "../schedule/ScheduleClient.tsx",
  "../teams/TeamsClient.tsx",
  "../technicians/TechniciansClient.tsx",
  "../users/UsersClient.tsx",
].map((path) => ({
  path,
  source: readFileSync(new URL(path, import.meta.url), "utf8"),
}));

const dashboardSource = readFileSync(new URL("../dashboard/DashboardClient.tsx", import.meta.url), "utf8");

test("branch-scoped pages read supervisor branch selection from layout scope", () => {
  for (const { path, source } of consumers) {
    assert.match(source, /import \{ useBranchScope \} from "@\/components\/layout\/BranchScopeProvider"/, path);
    assert.match(source, /const \{ selectedBranchId \} = useBranchScope\(\)/, path);
    assert.match(source, /const branchFilterId = isSupervisor \? selectedBranchId : "ALL"/, path);
    assert.doesNotMatch(source, /import \{ BranchFilter \} from "@\/components\/ui\/BranchFilter"/, path);
  }
});

test("dashboard reads branch selection from layout scope and removes local branch picker state", () => {
  assert.match(dashboardSource, /import \{ useBranchScope \} from "@\/components\/layout\/BranchScopeProvider"/);
  assert.match(dashboardSource, /const \{ selectedBranchId, setSelectedBranchId \} = useBranchScope\(\)/);
  assert.match(dashboardSource, /const selectedBranch = isSupervisor \? selectedBranchId : "ALL"/);
  assert.doesNotMatch(dashboardSource, /const \[selectedBranch, setBranch\]/);
  assert.doesNotMatch(dashboardSource, /selectBranch\(b\.id\)/);
});
