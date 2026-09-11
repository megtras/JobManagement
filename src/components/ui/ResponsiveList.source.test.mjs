import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const helperUrl = new URL("./ResponsiveList.tsx", import.meta.url);

test("responsive list helper provides desktop tables and mobile cards", () => {
  assert.equal(existsSync(helperUrl), true);
  const source = readFileSync(helperUrl, "utf8");

  assert.match(source, /export function ResponsiveListShell/);
  assert.match(source, /export function DesktopTable/);
  assert.match(source, /export function MobileCardList/);
  assert.match(source, /export function RecordCard/);
  assert.match(source, /hidden md:block/);
  assert.match(source, /md:hidden/);
});

test("wide operational lists use the responsive list helper", () => {
  const files = [
    "../appointments/AppointmentsClient.tsx",
    "../customers/CustomersClient.tsx",
    "../tasks/TasksClient.tsx",
    "../technicians/TechniciansClient.tsx",
    "../users/UsersClient.tsx",
  ];

  for (const relativePath of files) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /@\/components\/ui\/ResponsiveList/, relativePath);
  }
});

test("appointment payment status uses a structured toggle instead of wrapping inline controls", () => {
  const source = readFileSync(new URL("../appointments/AppointmentsClient.tsx", import.meta.url), "utf8");
  const paymentStatus = source.match(/const paymentStatus = \(a: AppointmentRow\) => \{[\s\S]*?\n  \};/);

  assert.ok(paymentStatus, "paymentStatus helper should exist");
  assert.match(paymentStatus[0], /data-payment-status/);
  assert.doesNotMatch(paymentStatus[0], /flex flex-wrap items-center gap-2/);
});

test("appointment total header aligns with left-aligned currency values", () => {
  const source = readFileSync(new URL("../appointments/AppointmentsClient.tsx", import.meta.url), "utf8");

  assert.match(source, /<th className="px-4 py-3 w-36 text-left">Total<\/th>/);
  assert.match(source, /<div className="font-semibold text-blue-700 whitespace-nowrap">RM \{a\.totalPrice\.toFixed\(2\)\}<\/div>/);
});

test("appointment payment columns separate type from status", () => {
  const source = readFileSync(new URL("../appointments/AppointmentsClient.tsx", import.meta.url), "utf8");

  assert.match(source, /<th className="px-4 py-3 w-36">Payment Type<\/th>/);
  assert.match(source, /<th className="px-4 py-3 w-40">Payment Status<\/th>/);
  assert.match(source, /const paymentType = \(a: AppointmentRow\) => \{/);
  assert.match(source, /const paymentStatus = \(a: AppointmentRow\) => \{/);
});

test("appointment job status is a separate column immediately before schedule", () => {
  const source = readFileSync(new URL("../appointments/AppointmentsClient.tsx", import.meta.url), "utf8");

  assert.match(source, /<th className="px-4 py-3 w-32">Job Status<\/th>\s*<th className="px-4 py-3 w-40">Schedule<\/th>/);
  assert.match(source, /<td className="px-4 py-3 whitespace-nowrap">\s*<div className="flex flex-col items-start gap-1\.5">\s*<span className=\{`shrink-0 inline-flex px-2 py-0\.5 rounded-full text-xs font-medium \$\{STATUS_CONFIG\[jobStatus\]\.badge\}`\}>/);
  assert.doesNotMatch(source, /Schedule \/ Status/);
});
