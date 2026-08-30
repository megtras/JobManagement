import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionSource = readFileSync(new URL("./inventory.ts", import.meta.url), "utf8");
const inventoryClientSource = readFileSync(new URL("../../components/inventory/InventoryClient.tsx", import.meta.url), "utf8");
const inventoryPageSource = readFileSync(new URL("../../app/(application)/(system)/inventory/page.tsx", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

test("category changes revalidate appointment forms that consume category prices", () => {
  assert.match(actionSource, /createJobCategory[\s\S]*revalidatePath\("\/inventory"\)[\s\S]*revalidatePath\("\/appointments"\)/);
  assert.match(actionSource, /updateJobCategory[\s\S]*revalidatePath\("\/inventory"\)[\s\S]*revalidatePath\("\/appointments"\)/);
  assert.match(actionSource, /deleteJobCategory[\s\S]*revalidatePath\("\/inventory"\)[\s\S]*revalidatePath\("\/appointments"\)/);
});

test("job categories store a photo template minimum and inventory exposes 3x 5x 10x choices", () => {
  assert.match(schemaSource, /model JobCategory \{[\s\S]*minEvidencePhotos\s+Int\s+@default\(3\)/);
  assert.match(actionSource, /type PhotoTemplateMinimum = 3 \| 5 \| 10/);
  assert.match(actionSource, /function normalizePhotoTemplate/);
  assert.match(actionSource, /minEvidencePhotos: normalizePhotoTemplate\(data\.minEvidencePhotos\)/);
  assert.match(inventoryPageSource, /minEvidencePhotos: c\.minEvidencePhotos \?\? 3/);
  assert.match(inventoryClientSource, /minEvidencePhotos: number/);
  assert.match(inventoryClientSource, /PHOTO_TEMPLATE_OPTIONS = \[\s*\{ value: 3, label: "Template-3x" \},\s*\{ value: 5, label: "Template-5x" \},\s*\{ value: 10, label: "Template-10x" \},\s*\]/);
  assert.match(inventoryClientSource, /createJobCategory\(\{ name: newName, price: parseFloat\(newPrice\) \|\| 0, minEvidencePhotos: newTemplate \}\)/);
  assert.match(inventoryClientSource, /updateJobCategory\(id, \{ name: editName, price: parseFloat\(editPrice\) \|\| 0, minEvidencePhotos: editTemplate \}\)/);
});
