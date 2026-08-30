import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modalSource = readFileSync(new URL("./AppointmentModal.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/appointments/[id]/route.ts", import.meta.url), "utf8");

test("edit appointment submits through the appointment PUT route", () => {
  assert.match(routeSource, /export async function PUT/);
  assert.match(modalSource, /fetch\(`\/api\/appointments\/\$\{editing\.id\}`,\s*\{\s*method: "PUT"/);
  assert.doesNotMatch(modalSource, /await updateAppointment\(editing\.id,/);
});

test("edit appointment PUT payload keeps existing asset ids so category edits replace the same asset", () => {
  assert.match(routeSource, /assets: Array<\{[\s\S]*id\?: string;/);
  assert.match(modalSource, /const assets = validAssets\.map\(\(asset\) => \(\{[\s\S]*id: asset\.id,/);
});

test("appointment modal keeps desktop time spinner and adds mobile tablet typing picker", () => {
  assert.match(modalSource, /function TimeSpinnerInput/);
  assert.match(modalSource, /function MobileTimePickerInput/);
  assert.match(modalSource, /function parseMobileTimeInput/);
  assert.match(modalSource, /const MOBILE_TIME_PICKER_OPTIONS = Array\.from/);
  assert.match(modalSource, /inputMode="text"/);
  assert.match(modalSource, /lg:hidden/);
  assert.match(modalSource, /hidden lg:block/);
  assert.match(modalSource, /<MobileTimePickerInput[\s\S]*ariaLabel="Time Start"/);
  assert.match(modalSource, /<TimeSpinnerInput[\s\S]*ariaLabel="Time Start"/);
});

test("desktop time spinner locks page scrolling while focused", () => {
  assert.match(modalSource, /const timeSpinnerRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(modalSource, /const \[isScrollLocked, setIsScrollLocked\] = useState\(false\)/);
  assert.match(modalSource, /document\.addEventListener\("wheel", preventPageWheel, \{ passive: false \}\)/);
  assert.match(modalSource, /document\.removeEventListener\("wheel", preventPageWheel\)/);
  assert.match(modalSource, /const preventPageWheel = \(event: globalThis\.WheelEvent\) => \{\s*event\.preventDefault\(\);/);
  assert.doesNotMatch(modalSource, /contains\(event\.target as Node\)\) event\.preventDefault/);
  assert.match(modalSource, /onFocus=\{\(\) => setIsScrollLocked\(true\)\}/);
  assert.match(modalSource, /onMouseDown=\{\(\) => setIsScrollLocked\(true\)\}/);
  assert.match(modalSource, /onBlur=\{handleBlur\}/);
});
