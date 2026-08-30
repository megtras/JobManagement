import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const clientSource = readFileSync(new URL("./PaymentsClient.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/payments/route.ts", import.meta.url), "utf8");

test("payments client filters supervisor rows by global branch scope", () => {
  assert.match(clientSource, /import \{ useBranchScope \} from "@\/components\/layout\/BranchScopeProvider"/);
  assert.match(clientSource, /branch: \{ id: string; name: string \}/);
  assert.match(clientSource, /const \{ selectedBranchId \} = useBranchScope\(\)/);
  assert.match(clientSource, /const filteredPayments = payments\.filter\(\(p\) => selectedBranchId === "ALL" \|\| p\.appointment\.branch\.id === selectedBranchId\)/);
  assert.match(clientSource, /filteredPayments\.map\(\(p\) =>/);
});

test("payments api includes branch id for client-side supervisor branch filtering", () => {
  assert.match(routeSource, /branch: \{ select: \{ id: true, name: true \} \}/);
  assert.match(routeSource, /branch: p\.appointment\.branch/);
});
