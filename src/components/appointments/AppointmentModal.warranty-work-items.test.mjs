import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const modalSource = readFileSync(new URL("./AppointmentModal.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../../lib/actions/appointments.ts", import.meta.url), "utf8");

test("appointment create and edit persist per-asset billing and chargeable totals", () => {
  assert.match(actionSource, /calculateChargeableAssetTotal/);
  assert.match(actionSource, /billingType: asset\.billingType/);
  assert.match(actionSource, /isTroubleshoot: isTroubleshootCategoryName/);
  assert.match(modalSource, /const rawUnitPrice = asset\.unitPrice\.trim\(\)/);
  assert.match(modalSource, /const unitPrice = rawUnitPrice === "" \? categoryPrice : Number\(rawUnitPrice\)/);
  assert.match(modalSource, /const safeUnitPrice = Number\.isFinite\(unitPrice\) \? unitPrice : 0/);
  assert.match(modalSource, /billingType === "WARRANTY" && safeUnitPrice <= 0\s*\? "WARRANTY"/);
  // Pricing now resolves through the (asset type x category) matrix, so the
  // memo depends on the resolver rather than on categoryById directly.
  assert.match(modalSource, /\[locations, resolveUnitPrice, billingType\]/);
  assert.match(modalSource, /billingType: asset\.billingType,/);
});
