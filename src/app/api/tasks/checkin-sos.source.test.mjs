import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const schemaSource = readFileSync(new URL("../../../../prisma/schema.prisma", import.meta.url), "utf8");
const taskDetailSource = readFileSync(new URL("../../../components/tasks/TaskDetailClient.tsx", import.meta.url), "utf8");
const appointmentListSource = readFileSync(new URL("../../../components/appointments/AppointmentsClient.tsx", import.meta.url), "utf8");
const appointmentPageSource = readFileSync(new URL("../../(application)/(system)/appointments/page.tsx", import.meta.url), "utf8");
const appointmentDetailSource = readFileSync(new URL("../../../components/appointments/AppointmentDetailClient.tsx", import.meta.url), "utf8");
const appointmentRouteSource = readFileSync(new URL("../appointments/[id]/route.ts", import.meta.url), "utf8");
const notificationsSource = readFileSync(new URL("../../../components/notifications/NotificationsClient.tsx", import.meta.url), "utf8");

const sosRouteUrl = new URL("./[id]/checkin-sos/route.ts", import.meta.url);
const pushRouteUrl = new URL("../appointments/[id]/push-checkin/route.ts", import.meta.url);

test("schema stores pending and resolved SOS check-in metadata", () => {
  assert.match(schemaSource, /checkInSosRequestedAt\s+DateTime\?/);
  assert.match(schemaSource, /checkInSosRequestedById\s+String\?/);
  assert.match(schemaSource, /checkInSosAddress\s+String\?/);
  assert.match(schemaSource, /checkInSosLat\s+Float\?/);
  assert.match(schemaSource, /checkInSosLng\s+Float\?/);
  assert.match(schemaSource, /checkInSosResolvedAt\s+DateTime\?/);
  assert.match(schemaSource, /checkInSosResolvedById\s+String\?/);
  assert.match(schemaSource, /checkInSosRequester\s+User\?/);
  assert.match(schemaSource, /checkInSosResolver\s+User\?/);
  assert.match(schemaSource, /source\s+String\s+@default\("GPS"\)/);
  assert.match(schemaSource, /approvedById\s+String\?/);
});

test("technician task page can send an SOS check-in request for a selected work location", () => {
  assert.ok(existsSync(sosRouteUrl), "expected technician SOS check-in route");
  const sosRouteSource = readFileSync(sosRouteUrl, "utf8");

  assert.match(taskDetailSource, /handleCheckInSos\(loc, locIdx\)/);
  assert.match(taskDetailSource, /\/api\/tasks\/\$\{taskId\}\/checkin-sos/);
  assert.match(taskDetailSource, />\s*SOS\s*</);
  assert.match(taskDetailSource, /checkInSosRequestedAt\?: string \| null/);
  assert.match(taskDetailSource, /checkInSosResolvedAt\?: string \| null/);
  assert.match(sosRouteSource, /session\.user\.role !== "TECHNICIAN"/);
  assert.match(sosRouteSource, /technicianTeamAccessWhere\(session\.user\.id, session\.user\.name\)/);
  assert.match(sosRouteSource, /checkInSosRequestedAt: capturedDate\(body\.requestedAt\)/);
  assert.match(sosRouteSource, /checkInSosRequestedById: session\.user\.id/);
  assert.match(sosRouteSource, /type: "SOS_CHECKIN"/);
});

test("staff push check-in bypasses geofence and creates an approved check-in", () => {
  assert.ok(existsSync(pushRouteUrl), "expected staff push check-in route");
  const pushRouteSource = readFileSync(pushRouteUrl, "utf8");

  assert.match(pushRouteSource, /role === "TECHNICIAN"/);
  assert.match(pushRouteSource, /role !== "SUPERVISOR" && appt\.branchId !== branchId/);
  assert.match(pushRouteSource, /const checkLat = appt\.checkInSosLat \?\? appt\.locationLat/);
  assert.match(pushRouteSource, /const checkLng = appt\.checkInSosLng \?\? appt\.locationLng/);
  assert.doesNotMatch(pushRouteSource, /haversineDistance/);
  assert.doesNotMatch(pushRouteSource, /GEOFENCE_RADIUS_METERS/);
  assert.match(pushRouteSource, /source: "SOS_PUSH"/);
  assert.match(pushRouteSource, /approvedById: session\.user\.id/);
  assert.match(pushRouteSource, /checkInSosResolvedAt: new Date\(\)/);
  assert.match(pushRouteSource, /checkInSosResolvedById: session\.user\.id/);
  assert.match(pushRouteSource, /status: "IN_PROGRESS"/);
});

test("staff UI surfaces pending SOS from notifications, list, and appointment detail", () => {
  assert.match(notificationsSource, /SOS_CHECKIN:\s*\{ icon: AlertTriangle, color: "text-red-600"\s*\}/);
  assert.match(notificationsSource, /notification\.type === "SOS_CHECKIN"\s*\?\s*"\/appointments\?sos=1"/);
  assert.match(appointmentPageSource, /searchParams: Promise<\{\s*urgent\?: string;\s*overdue\?: string;\s*sos\?: string\s*\}>/);
  assert.match(appointmentPageSource, /const initialSosOnly = sos === "1"/);
  assert.match(appointmentListSource, /type AppointmentFilter = "ALL" \| "COMING_SOON" \| "IN_PROGRESS" \| "DONE" \| "URGENT" \| "OVERDUE" \| "SOS"/);
  assert.match(appointmentListSource, /function hasPendingSos\(a: AppointmentRow\)/);
  assert.match(appointmentListSource, /appointmentFilter !== "SOS" \|\| hasPendingSos\(a\)/);
  assert.match(appointmentListSource, /href=\{`\/appointments\/\$\{a\.id\}`\}/);
  assert.match(appointmentListSource, />\s*SOS\s*</);
  assert.match(appointmentDetailSource, /handlePushCheckIn/);
  assert.match(appointmentDetailSource, /\/api\/appointments\/\$\{appointmentId\}\/push-checkin/);
  assert.match(appointmentDetailSource, />\s*Push Check-in\s*</);
  assert.match(appointmentDetailSource, /approved .* to check in at this location/);
  assert.doesNotMatch(appointmentDetailSource, /telah membenarkan|location ini/);
  assert.match(appointmentRouteSource, /checkInSosRequester: \{ select: \{ id: true, name: true \} \}/);
  assert.match(appointmentRouteSource, /checkInSosResolver: \{ select: \{ id: true, name: true \} \}/);
});
