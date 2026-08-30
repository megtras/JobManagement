import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const google = readFileSync(new URL("./AddressPickerGoogle.tsx", import.meta.url), "utf8");
const selector = readFileSync(new URL("./AddressPickerModal.tsx", import.meta.url), "utf8");

test("Google picker is a client component reading both required env vars", () => {
  assert.match(google, /^"use client";/);
  assert.match(google, /process\.env\.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(google, /process\.env\.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID/);
});

test("uses the official @vis.gl wrapper with a Map ID for AdvancedMarker", () => {
  assert.match(google, /from "@vis\.gl\/react-google-maps"/);
  assert.match(google, /<APIProvider/);
  assert.match(google, /mapId=\{MAP_ID\}/);
});

test("renders a DRAGGABLE AdvancedMarker that reverse-geocodes on drop", () => {
  assert.match(google, /<AdvancedMarker[\s\S]*?draggable[\s\S]*?onDragEnd=\{handleDragEnd\}/);
  assert.match(google, /function handleDragEnd/);
  assert.match(google, /reverseGeocode\(lat, lng\)/);
  assert.match(google, /new geocodingLib\.Geocoder\(\)/);
});

test("Places autocomplete is Malaysia-biased and uses the current (non-legacy) API", () => {
  assert.match(google, /AutocompleteSuggestion\.fetchAutocompleteSuggestions/);
  assert.match(google, /includedRegionCodes:\s*\["my"\]/);
  assert.doesNotMatch(google, /new google\.maps\.places\.Autocomplete\(/);
});

test("current-location button uses high-accuracy geolocation", () => {
  assert.match(google, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(google, /enableHighAccuracy:\s*true/);
});

test("confirm saves the final pin coordinate, not the raw geocoded one", () => {
  assert.match(google, /onAdd\(address \|\| query, coords\?\.lat \?\? null, coords\?\.lng \?\? null, district\)/);
});

test("map opens over Klang Valley / Selangor by default", () => {
  assert.match(google, /const DEFAULT_CENTER = \{ lat: 3\.0738, lng: 101\.5183 \}/);
});

test("surfaces a clear error when the API key/Map ID is wrong", () => {
  assert.match(google, /useApiLoadingStatus\(\)/);
  assert.match(google, /AUTH_FAILURE|FAILED/);
  assert.match(google, /onFallbackToLeaflet\?: \(\) => void/);
  assert.match(google, /<APIProvider[\s\S]*onError=\{\(\) => onFallbackToLeaflet\?\.\(\)\}/);
  assert.match(google, /useEffect\(\(\) => \{[\s\S]*if \(!authFailed \|\| !onFallbackToLeaflet\) return;[\s\S]*onFallbackToLeaflet\(\);[\s\S]*\}, \[authFailed, onFallbackToLeaflet\]\)/);
});

test("selector defaults to Leaflet and only uses Google when explicitly enabled", () => {
  assert.match(selector, /NEXT_PUBLIC_MAPS_PROVIDER === "google"/);
  assert.match(selector, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(selector, /NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID/);
  assert.match(selector, /const \[provider, setProvider\] = useState<"google" \| "leaflet">/);
  assert.match(selector, /provider === "google"/);
  assert.match(selector, /onFallbackToLeaflet=\{\(\) => setProvider\("leaflet"\)\}/);
});
