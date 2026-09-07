import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const taskPaymentRoute = readFileSync(new URL("../tasks/[id]/payment/route.ts", import.meta.url), "utf8");
const toggleRoute = readFileSync(new URL("./[id]/toggle/route.ts", import.meta.url), "utf8");
const approveRoute = readFileSync(new URL("../appointments/[id]/approve/route.ts", import.meta.url), "utf8");
const appointmentDetail = readFileSync(new URL("../../../components/appointments/AppointmentDetailClient.tsx", import.meta.url), "utf8");
const appointmentsClient = readFileSync(new URL("../../../components/appointments/AppointmentsClient.tsx", import.meta.url), "utf8");
const dashboardClient = readFileSync(new URL("../../../components/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const receiptRouteUrl = new URL("./[id]/receipt/route.ts", import.meta.url);
const receiptRoute = existsSync(receiptRouteUrl) ? readFileSync(receiptRouteUrl, "utf8") : "";

test("technician office payment records pending status without requiring a receipt", () => {
  assert.match(taskPaymentRoute, /if \(method !== "OFFICE" && !receipt\)/);
  assert.match(taskPaymentRoute, /status: "PENDING"/);
  assert.doesNotMatch(taskPaymentRoute, /status: method === "OFFICE" \? "APPROVED" : "PENDING"/);
});

test("office payment approval is blocked until supervisor proof photo exists", () => {
  assert.match(toggleRoute, /method: true/);
  assert.match(toggleRoute, /receiptPhotoUrl: true/);
  assert.match(toggleRoute, /nextStatus === "APPROVED"[\s\S]*payment\.method === "OFFICE"[\s\S]*!payment\.receiptPhotoUrl/);
  assert.match(toggleRoute, /Office payment proof is required before marking payment as received/);

  assert.match(approveRoute, /payments: \{ select: \{ method: true, receiptPhotoUrl: true, status: true \} \}/);
  assert.match(approveRoute, /officePaymentWithoutProof/);
  assert.match(approveRoute, /Office payment proof is required before approving and closing this job/);
});

test("staff can upload and cancel office payment proof from appointment detail", () => {
  assert.match(receiptRoute, /export async function POST/);
  assert.match(receiptRoute, /if \(role === "TECHNICIAN"\)/);
  assert.match(receiptRoute, /method: "OFFICE"/);
  assert.match(receiptRoute, /receiptPhotoUrl/);
  assert.match(receiptRoute, /uploadPublicUrl\("photos", filename\)/);
  assert.match(receiptRoute, /revalidatePath\("\/appointments"\)/);

  assert.match(appointmentDetail, /officeReceiptFile/);
  assert.match(appointmentDetail, /Upload Payment Photo/);
  assert.match(appointmentDetail, /Save/);
  assert.match(appointmentDetail, /Cancel/);
  assert.match(appointmentDetail, /\/api\/payments\/\$\{paymentId\}\/receipt/);
  assert.match(appointmentDetail, /Re-upload Receipt/);
  assert.match(appointmentDetail, /canApprovePayments && p\.method === "OFFICE"/);
  assert.doesNotMatch(appointmentDetail, /canApprovePayments && p\.method === "OFFICE" && !p\.receiptPhotoUrl/);
});

test("office payment proof images are validated and stored in R2 without native processing", () => {
  assert.doesNotMatch(receiptRoute, /import sharp from "sharp"/);
  assert.match(receiptRoute, /const receiptBuffer = Buffer\.from\(await receipt\.arrayBuffer\(\)\)/);
  assert.match(receiptRoute, /!receipt\.type\.startsWith\("image\/"\)/);
  assert.match(receiptRoute, /const imageExtension = receipt\.type === "image\/png" \? "png" : receipt\.type === "image\/webp" \? "webp" : "jpg"/);
  assert.match(receiptRoute, /await putUpload\("photos", filename, receiptBuffer/);
  assert.match(receiptRoute, /Please upload a valid image or PDF file/);
});

test("office payment proof can be uploaded as a PDF without image conversion", () => {
  assert.match(receiptRoute, /receipt\.type === "application\/pdf"/);
  assert.match(receiptRoute, /office-receipt-\$\{Date\.now\(\)\}\.pdf/);
  assert.match(receiptRoute, /await putUpload\("photos", filename, receiptBuffer, isPdfReceipt \? "application\/pdf" : receipt\.type\)/);

  assert.match(appointmentDetail, /accept="image\/\*,application\/pdf"/);
  assert.match(appointmentDetail, /officeReceiptFile\?\.type === "application\/pdf"/);
  assert.match(appointmentDetail, /PDF receipt selected/);
});

test("appointment and dashboard POP viewers use a PDF link instead of an image tag", () => {
  assert.match(appointmentsClient, /isPdfReceiptUrl/);
  assert.match(appointmentsClient, /Open PDF receipt/);
  assert.match(appointmentsClient, /target="_blank"/);

  assert.match(dashboardClient, /isPdfReceiptUrl/);
  assert.match(dashboardClient, /PDF/);
  assert.match(dashboardClient, /Open PDF receipt/);
});

test("appointment table shows office POP after upload and disables Yes until proof exists", () => {
  assert.match(appointmentsClient, /function officePaymentNeedsProof/);
  assert.match(appointmentsClient, /a\.payment\.method === "OFFICE" && !a\.payment\.receiptPhotoUrl/);
  assert.match(appointmentsClient, /const hasPop = !!a\.payment\.receiptPhotoUrl/);
  assert.match(appointmentsClient, /disabled=\{busy \|\| officeNeedsProof\}/);
  assert.match(appointmentsClient, /Upload office payment proof first/);
});
