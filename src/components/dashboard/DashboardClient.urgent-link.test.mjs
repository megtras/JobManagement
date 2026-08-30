import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./DashboardClient.tsx", import.meta.url), "utf8");
const trackingSource = readFileSync(new URL("./TrackingMap.tsx", import.meta.url), "utf8");
const trackingLibSource = readFileSync(new URL("../../lib/team-tracking.ts", import.meta.url), "utf8");

test("urgent dashboard banner links management users to urgent appointments list", () => {
  assert.match(source, /<Link href="\/appointments\?urgent=1"/);
  assert.match(source, /data\.urgentCount > 0 \?/);
  assert.match(source, /Flagged by technicians/);
});

test("overdue dashboard banner links management users to overdue appointments list", () => {
  assert.match(source, /<Link href="\/appointments\?overdue=1"/);
  assert.match(source, /data\.overdueCount > 0 \?/);
  assert.match(source, /Overdue Tasks/);
});

test("dashboard includes a completed jobs by category graph instead of a stat card", () => {
  assert.match(source, /Completed Jobs by Category/);
  assert.match(source, /completedJobsByCategory/);
  assert.doesNotMatch(source, /label="Top Job Category"/);
});

test("dashboard replaces the two top graph cards with one tracking map card", () => {
  assert.match(source, /import \{ TrackingPanel, type TeamTrackingPoint \} from "@\/components\/dashboard\/TrackingMap"/);
  assert.match(source, /teamTracking: TeamTrackingPoint\[\]/);
  assert.match(source, /const trackingPoints = data\.teamTracking\.filter/);
  assert.match(source, /point\.teamIds\.includes\(selectedTeam\)/);
  assert.match(source, /<TrackingPanel points=\{trackingPoints\} label=\{trackingLabel\} \/>/);
  assert.doesNotMatch(source, /<h2 className="text-sm font-semibold text-gray-800">Customer Deals<\/h2>/);
  assert.doesNotMatch(source, /<h2 className="text-sm font-semibold text-gray-800">Completed Jobs<\/h2>/);
});

test("dashboard job list can filter by job category from a dropdown beside search", () => {
  assert.match(source, /const \[jobCategoryFilter, setJobCategoryFilter\] = useState<"ALL" \| string>\("ALL"\)/);
  assert.match(source, /const jobCategoryOptions = Array\.from/);
  assert.match(source, /new Set\(\s*scopedJobs\s*\.map\(\(j\) => j\.jobCategory\?\.name\?\.trim\(\)\)\s*\.filter/);
  assert.match(source, /\.filter\(\(j\) => jobCategoryFilter === "ALL" \|\| \(j\.jobCategory\?\.name\?\.trim\(\) \|\| "Uncategorized"\) === jobCategoryFilter\)/);
  assert.match(source, /useEffect\(\(\) => \{\s*setJobsPage\(1\);\s*\}, \[jobSearch, jobStatusFilter, jobCategoryFilter, paymentMethodFilter, selectedTeam, selectedBranch, period, dateParam\]\)/);
  assert.match(source, /placeholder="Search customer, phone, or title"[\s\S]*<select[\s\S]*aria-label="Filter job list by job category"/);
  assert.match(source, /<option value="ALL">All Categories<\/option>/);
  assert.match(source, /jobCategoryOptions\.map\(\(category\) =>/);
  assert.match(source, /className="flex h-10 shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden text-sm w-fit"/);
  assert.match(source, /className=\{`px-2\.5 sm:px-3 py-2 font-medium whitespace-nowrap transition/);
});

test("dashboard job list can filter by QR, cash, and office payment methods", () => {
  assert.match(source, /type PaymentMethodFilter = "ALL" \| "QR_TRANSFER" \| "CASH" \| "OFFICE"/);
  assert.match(source, /const \[paymentMethodFilter, setPaymentMethodFilter\] = useState<PaymentMethodFilter>\("ALL"\)/);
  assert.match(source, /\.filter\(\(j\) => paymentMethodFilter === "ALL" \|\| j\.payment\?\.method === paymentMethodFilter\)/);
  assert.match(source, /aria-label="Filter job list by payment method"/);
  assert.match(source, /\["QR_TRANSFER", "QR"\]/);
  assert.match(source, /\["CASH", "Cash"\]/);
  assert.match(source, /\["OFFICE", "Office"\]/);
  assert.match(source, /aria-pressed=\{paymentMethodFilter === value\}/);
});

test("tracking map has car pins and a closable expanded modal", () => {
  assert.match(trackingSource, /@vis\.gl\/react-google-maps/);
  assert.match(trackingSource, /<APIProvider[\s\S]*apiKey=\{GOOGLE_MAPS_API_KEY\}[\s\S]*libraries=\{\["marker"\]\}[\s\S]*onError=\{\(\) => setGoogleMapsFailed\(true\)\}/);
  assert.match(trackingSource, /<GoogleMap/);
  assert.match(trackingSource, /<AdvancedMarker/);
  assert.match(trackingSource, /const \[googleMapsFailed, setGoogleMapsFailed\] = useState\(false\)/);
  assert.match(trackingSource, /if \(googleMapsFailed\) \{\s*return <LeafletTrackingMap points=\{points\} className=\{className\} \/>;\s*\}/);
  assert.match(trackingSource, /<LeafletTrackingMap points=\{points\} className=\{className\} \/>/);
  assert.match(trackingSource, /const TRACKING_ROLE_COLOR/);
  assert.match(trackingSource, /TECHNICIAN: "#dc2626"/);
  assert.match(trackingSource, /MANAGER: "#2563eb"/);
  assert.match(trackingSource, /ADMIN: "#facc15"/);
  assert.match(trackingSource, /function ModernCarMarkerShape\(\{ role \}/);
  assert.match(trackingSource, /function buildCarMarkerSvg/);
  assert.match(trackingSource, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100" height="110" viewBox="0 -16 84 92"/);
  assert.match(trackingSource, /linearGradient id="carGlass"/);
  assert.match(trackingSource, /linearGradient id="carPin"/);
  assert.match(trackingSource, /d="M36 1\.5c-6\.4 0-11\.6 5-11\.6 11\.2/);
  assert.match(trackingSource, /<ModernCarMarkerShape role=\{point\.role\} \/>/);
  assert.match(trackingSource, /CAR_MARKER_HTML/);
  assert.match(trackingSource, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(trackingSource, /onClick=\{\(\) => setExpanded\(true\)\}/);
  assert.match(trackingSource, /onClick=\{\(\) => setExpanded\(false\)\}/);
  assert.match(trackingSource, /aria-label="Close tracking map"/);
  assert.match(trackingSource, /selectedPoint\.accountName/);
  assert.match(trackingSource, /selectedPoint\.branchName/);
  assert.match(trackingSource, /roleLabel\(selectedPoint\.role\)/);
});

test("tracking data visibility follows viewer role rules", () => {
  assert.match(trackingLibSource, /const isSupervisor = role === "SUPERVISOR"/);
  assert.match(trackingLibSource, /isSupervisor \? \{ not: "SUPERVISOR" \}/);
  assert.match(trackingLibSource, /role: isSupervisor \? \{ not: "SUPERVISOR" \} : "TECHNICIAN"/);
  assert.match(trackingLibSource, /role !== "SUPERVISOR" && branchId/);
  assert.match(trackingLibSource, /branch: \{ select: \{ name: true \} \}/);
  assert.match(trackingLibSource, /teams: \{ select: \{ id: true, name: true \} \}/);
  assert.match(trackingLibSource, /accountName: user\.name/);
  assert.match(trackingLibSource, /teamIds: user\.teams\.map/);
  assert.match(trackingLibSource, /teamNames: user\.teams\.map/);
});

test("completed jobs by category uses appointment done status instead of payment approval", () => {
  assert.match(source, /const periodScopedJobs = scopedJobs\.filter\(\(j\) => inPeriod\(j\.date, jobPeriodView, jobPeriodCursor\)\)/);
  assert.match(source, /const completedJobsByCategory = periodScopedJobs/);
  assert.match(source, /\.filter\(\(j\) => j\.status === "DONE"\)/);
  assert.doesNotMatch(source, /\.filter\(\(j\) => deriveJobStatus\(j\) === "DONE"\)/);
});

test("completed jobs by category uses an upright bar chart layout", () => {
  assert.match(source, /Completed Jobs by Category/);
  assert.doesNotMatch(source, /layout="vertical"/);
  assert.match(source, /<Bar dataKey="count" name="Completed Jobs"/);
});

test("dashboard includes a revenue line chart card", () => {
  assert.match(source, /LineChart/);
  assert.match(source, /Revenue Trend/);
  assert.match(source, /revenueChart/);
  assert.match(source, /<Line[^>]*dataKey="Revenue"/);
});

test("completed jobs by category assigns different colors to category bars", () => {
  assert.match(source, /CATEGORY_BAR_COLORS/);
  assert.match(source, /<Cell/);
  assert.match(source, /completedJobsByCategoryData\.map\(\(_, index\) =>/);
  assert.match(source, /fill=\{CATEGORY_BAR_COLORS\[index % CATEGORY_BAR_COLORS\.length\]\}/);
});
