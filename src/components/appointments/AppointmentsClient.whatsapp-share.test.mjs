import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./AppointmentsClient.tsx", import.meta.url), "utf8");

test("appointment list copies scheduled appointment details for manual sharing", () => {
  assert.match(source, /Copy/);
  assert.match(source, /const TERMS_URL = "\/terms-and-conditions"/);
  assert.doesNotMatch(source, /https:\/\/genplusaircond\.my/);
  assert.match(source, /function appointmentShareMessage\(a: AppointmentRow\)/);
  assert.match(source, /View our terms & conditions here: \$\{TERMS_URL\}/);
  assert.match(source, /async function copyTextToClipboard\(text: string\)/);
  assert.match(source, /navigator\.clipboard\?\.writeText/);
  assert.match(source, /document\.execCommand\("copy"\)/);
  assert.match(source, /function copyAppointmentShareMessage\(a: AppointmentRow\)/);
  assert.match(source, /copyTextToClipboard\(appointmentShareMessage\(a\)\)/);
  assert.match(source, /const \[copiedShareId, setCopiedShareId\] = useState<string \| null>\(null\)/);
  assert.match(source, /async function handleCopyAppointment\(a: AppointmentRow\)/);
  assert.match(source, /setCopiedShareId\(a\.id\)/);
  assert.doesNotMatch(source, /whatsapp:\/\/send/);
  assert.doesNotMatch(source, /web\.whatsapp\.com\/send/);
  assert.doesNotMatch(source, /window\.open\(/);
  assert.doesNotMatch(source, /window\.location\.href = url/);
  assert.match(source, /Your appointment has been scheduled:/);
  assert.match(source, /Job: \$\{a\.jobTitle \|\| a\.jobCategory\?\.name \|\| "-"\}/);
  assert.match(source, /Date: \$\{formatDate\(a\.date\)\}/);
  assert.match(source, /Time: \$\{time\}/);
  assert.match(source, /Team: \$\{teamNames\(a\) \|\| "To be assigned"\}/);
  assert.match(source, /"Thank you\."/);
  assert.match(source, /title=\{copied \? "Appointment message copied" : "Copy appointment message"\}/);
  assert.match(source, /aria-label="Copy appointment message"/);
  assert.match(source, /onClick=\{\(\) => void handleCopyAppointment\(a\)\}/);
  assert.match(source, /copied \? <CheckCircle2 className="w-4 h-4" \/> : <Copy className="w-4 h-4" \/>/);
});
