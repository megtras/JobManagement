import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pricingSource = readFileSync(new URL("./appointment-pricing.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

test("appointment assets carry billing type and totals sum chargeable assets only", () => {
  assert.match(schemaSource, /model AppointmentAsset \{[\s\S]*billingType\s+BillingType\s+@default\(CHARGEABLE\)/);
  assert.match(schemaSource, /model AppointmentAsset \{[\s\S]*isTroubleshoot\s+Boolean\s+@default\(false\)/);
  assert.match(pricingSource, /export function calculateChargeableAssetTotal/);
  assert.match(pricingSource, /asset\.billingType === "CHARGEABLE"/);
  assert.match(pricingSource, /export function isTroubleshootCategoryName/);
  assert.match(pricingSource, /toLowerCase\(\)\.includes\("troubleshoot"\)/);
});
