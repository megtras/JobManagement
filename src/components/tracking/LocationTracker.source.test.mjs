import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const trackerSource = readFileSync(new URL("./LocationTracker.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../../app/(application)/(system)/layout.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/tracking/location/route.ts", import.meta.url), "utf8");
const teamsRouteSource = readFileSync(new URL("../../app/api/tracking/teams/route.ts", import.meta.url), "utf8");
const dashboardRouteSource = readFileSync(new URL("../../app/api/dashboard/route.ts", import.meta.url), "utf8");
const trackingHelperSource = readFileSync(new URL("../../lib/team-tracking.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

test("app shell posts the user's latest browser location without rendering UI", () => {
  assert.match(layoutSource, /import \{ LocationTracker \} from "@\/components\/tracking\/LocationTracker"/);
  assert.match(layoutSource, /<LocationTracker userId=\{session\?\.user\.id \?\? null\} \/>/);
  assert.match(trackerSource, /export function LocationTracker\(\{ userId \}: \{ userId\?: string \| null \}\)/);
  assert.match(trackerSource, /const storageKey = `\$\{TRACKING_STORAGE_KEY\}:\$\{userId\}`/);
  assert.match(trackerSource, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(trackerSource, /navigator\.geolocation\.watchPosition/);
  assert.match(trackerSource, /navigator\.geolocation\.clearWatch\(watchId\)/);
  assert.match(trackerSource, /enableHighAccuracy:\s*true/);
  assert.match(trackerSource, /FALLBACK_LOCATION_OPTIONS/);
  assert.match(trackerSource, /navigator\.permissions\.query\(\{ name: "geolocation" as PermissionName \}\)/);
  assert.match(trackerSource, /fetch\("\/api\/tracking\/location"/);
  assert.match(trackerSource, /return null;/);
});

test("location tracker follows movement while the app stays open or becomes active again", () => {
  assert.match(trackerSource, /const MIN_POST_INTERVAL_MS = 10 \* 1000/);
  assert.match(trackerSource, /const MIN_MOVE_METERS = 15/);
  assert.match(trackerSource, /function distanceInMeters/);
  assert.match(trackerSource, /const postPosition = async \(position: GeolocationPosition/);
  assert.match(trackerSource, /postCurrentLocation\(\);/);
  assert.match(trackerSource, /const watchId = navigator\.geolocation\.watchPosition\(/);
  assert.match(trackerSource, /maximumAge:\s*5000/);
  assert.match(trackerSource, /window\.addEventListener\("focus", postCurrentLocation\)/);
  assert.match(trackerSource, /document\.addEventListener\("visibilitychange", handleVisible\)/);
  assert.match(trackerSource, /window\.setInterval\(postCurrentLocation, MIN_POST_INTERVAL_MS\)/);
  assert.match(trackerSource, /requestCurrentPosition\(LOCATION_OPTIONS\)/);
  assert.match(trackerSource, /requestCurrentPosition\(FALLBACK_LOCATION_OPTIONS\)/);
  assert.match(trackerSource, /lastPostAttemptAtRef\.current = 0/);
});

test("tracking route stores latest coordinates and reverse-geocoded area on the user", () => {
  assert.match(schemaSource, /lastLocationLat\s+Float\?/);
  assert.match(schemaSource, /lastLocationLng\s+Float\?/);
  assert.match(schemaSource, /lastLocationArea\s+String\?/);
  assert.match(schemaSource, /lastLocationAddress\s+String\?/);
  assert.match(schemaSource, /lastLocationAt\s+DateTime\?/);
  assert.match(routeSource, /getServerSession\(authOptions\)/);
  assert.match(routeSource, /reverseGeocode\(lat, lng\)/);
  assert.match(routeSource, /lastLocationLat: lat/);
  assert.match(routeSource, /lastLocationLng: lng/);
  assert.match(routeSource, /lastLocationArea: area/);
  assert.match(routeSource, /lastLocationAt: new Date\(\)/);
});

test("dashboard API includes latest team tracking points", () => {
  assert.match(trackingHelperSource, /export async function getTeamTracking/);
  assert.match(trackingHelperSource, /role: isSupervisor \? \{ not: "SUPERVISOR" \} : "TECHNICIAN"/);
  assert.match(trackingHelperSource, /branch: \{ select: \{ name: true \} \}/);
  assert.match(trackingHelperSource, /teams: \{ select: \{ id: true, name: true \} \}/);
  assert.match(trackingHelperSource, /lastLocationLat: true/);
  assert.match(trackingHelperSource, /lastLocationArea: true/);
  assert.match(trackingHelperSource, /return users\.map\(\(user\) =>/);
  assert.match(dashboardRouteSource, /getTeamTracking\(role, branchId\)/);
  assert.match(dashboardRouteSource, /teamTracking,/);
});

test("management dashboard can poll tracking without reloading all dashboard data", () => {
  assert.match(teamsRouteSource, /export async function GET\(\)/);
  assert.match(teamsRouteSource, /getServerSession\(authOptions\)/);
  assert.match(teamsRouteSource, /session\.user\.role === "TECHNICIAN"/);
  assert.match(teamsRouteSource, /getTeamTracking\(session\.user\.role, session\.user\.branchId\)/);
  assert.match(teamsRouteSource, /NextResponse\.json\(\{ teamTracking \}\)/);
});
