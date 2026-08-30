import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./DashboardClient.tsx", import.meta.url), "utf8");

test("dashboard pop receipts open in a closable in-page modal instead of a new tab", () => {
  assert.match(source, /const \[popViewer, setPopViewer\] = useState<string \| null>\(null\)/);
  assert.match(source, /onClick=\{\(\) => setPopViewer\(receiptUrl\)\}/);
  assert.match(source, /title="Open PDF receipt"/);
  assert.match(source, /\{popViewer && \(/);
  assert.match(source, /aria-label="Close proof of payment viewer"/);
  assert.match(source, /onClick=\{\(\) => setPopViewer\(null\)\}/);
  assert.match(source, /alt="Proof of payment full view"/);
  assert.doesNotMatch(source, /title="Open proof of payment"/);
  assert.doesNotMatch(source, /View POP<\/a>/);
});
