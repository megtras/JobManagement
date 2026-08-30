import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./AddressPickerLeaflet.tsx", import.meta.url), "utf8");

test("loads Leaflet CSS so tiles fill the map container", () => {
  assert.match(
    source,
    /import "leaflet\/dist\/leaflet\.css";/,
    "expected AddressPickerModal to import Leaflet CSS for tile positioning"
  );
});

test("uses a stable third-party raster tile layer without direct OSM public tiles", () => {
  assert.match(
    source,
    /CARTO_TILE_URL\s*=\s*"https:\/\/\{s\}\.basemaps\.cartocdn\.com\/light_all\/\{z\}\/\{x\}\/\{y\}\{r\}\.png"/,
    "expected the address picker to use a stable CARTO basemap tile source"
  );
  assert.doesNotMatch(
    source,
    /tile\.openstreetmap\.org/,
    "expected the address picker to avoid direct OpenStreetMap public tile servers"
  );
});

test("guards Leaflet map creation after async import settles", () => {
  const importStart = source.indexOf('import("leaflet")');
  const mapCreation = source.indexOf("L.map(", importStart);

  assert.notEqual(importStart, -1, "expected AddressPickerModal to dynamically import Leaflet");
  assert.notEqual(mapCreation, -1, "expected AddressPickerModal to create a Leaflet map");

  const beforeMapCreation = source.slice(importStart, mapCreation);

  assert.match(
    beforeMapCreation,
    /leafletMap\.current/,
    "expected a live map ref guard after the async Leaflet import resolves"
  );
  assert.match(
    beforeMapCreation,
    /hasLeafletMap\(container\)/,
    "expected a DOM container Leaflet id guard after the async Leaflet import resolves"
  );
  assert.match(source, /function hasLeafletMap[\s\S]*_leaflet_id/);
});

test("normalizes Leaflet interop before reading plugin methods", () => {
  assert.doesNotMatch(source, /maplibreGL/);
});

test("opens the map around Selangor and refreshes tiles after the modal renders", () => {
  assert.match(
    source,
    /const DEFAULT_CENTER:\s*\[number,\s*number\]\s*=\s*\[3\.0738,\s*101\.5183\]/,
    "expected the address picker map to start around Selangor"
  );
  assert.match(source, /const DEFAULT_ZOOM\s*=\s*10/);
  assert.match(
    source,
    /setTimeout\(\(\)\s*=>\s*map\.invalidateSize\(\)/,
    "expected a delayed invalidateSize call so modal maps do not render partial tiles"
  );
});

test("debounces typed address queries and moves the pin from the latest result", () => {
  assert.match(source, /const SEARCH_DEBOUNCE_MS\s*=\s*700/);
  assert.match(source, /setTimeout\(\(\)\s*=>\s*\{\s*void searchAddress\(trimmedQuery\)/);
  assert.match(source, /clearTimeout\(timer\)/);
  assert.match(source, /latestSearchRef\.current\s*=\s*requestId/);
  assert.match(source, /requestId !== latestSearchRef\.current/);
});

test("shows a selectable dropdown for Leaflet geocoder results", () => {
  assert.match(source, /const \[searchResults, setSearchResults\] = useState<Point\[\]>\(\[\]\)/);
  assert.match(source, /const \[resultsOpen, setResultsOpen\] = useState\(false\)/);
  assert.match(source, /setSearchResults\(pts\)/);
  assert.match(source, /setResultsOpen\(pts\.length > 0\)/);
  assert.match(source, /selectResult\(0, false\)/);
  assert.match(source, /resultsOpen && searchResults\.length > 0/);
  assert.match(source, /searchResults\.map\(\(result, idx\) =>/);
  assert.match(source, /onClick=\{\(\) => selectResult\(idx\)\}/);
});

test("ranks merged geocoder results using query text instead of only state bias", () => {
  assert.match(source, /const SEARCH_TOKEN_ALIASES = \{/);
  assert.match(source, /const STREET_FRAGMENT_PATTERN =/);
  assert.match(source, /const STREET_NAME_PATTERN =/);
  assert.match(source, /function normalizeSearchText/);
  assert.match(source, /SEARCH_TOKEN_ALIASES\[token as keyof typeof SEARCH_TOKEN_ALIASES\] \?\? token/);
  assert.match(source, /function splitSearchSegments/);
  assert.match(source, /function extractStreetSearchTerm/);
  assert.match(source, /return `jalan \$\{streetFragment.toLowerCase\(\)\}`;/);
  assert.match(source, /function buildSearchTerms/);
  assert.match(source, /splitSearchSegments\(query\)\.slice\(1\)/);
  assert.match(source, /const exactStreetTerm = streetSegment \? extractStreetSearchTerm\(streetSegment\) : null;/);
  assert.match(source, /terms\.push\(exactStreetTerm\);/);
  assert.match(source, /terms\.push\(segment\);/);
  assert.match(source, /terms\.push\(`\$\{exactStreetTerm\}, \$\{combinedLocality\}`\);/);
  assert.match(source, /function extractStreetFragments/);
  assert.match(source, /function exactAddressFragmentScore/);
  assert.match(source, /function streetFragmentMismatchScore/);
  assert.match(source, /const queryFragments = extractStreetFragments\(query\);/);
  assert.match(source, /const displayFragments = extractStreetFragments\(display\);/);
  assert.match(source, /if \(displayFragments.length === 0\) return 0;/);
  assert.match(source, /const streetFragmentDiff = exactAddressFragmentScore\(query, b\.display\) - exactAddressFragmentScore\(query, a\.display\)/);
  assert.match(source, /if \(streetFragmentDiff !== 0\) return streetFragmentDiff;/);
  assert.match(source, /const streetMismatchDiff = streetFragmentMismatchScore\(query, b\.display\) - streetFragmentMismatchScore\(query, a\.display\)/);
  assert.match(source, /if \(streetMismatchDiff !== 0\) return streetMismatchDiff;/);
  assert.match(source, /function localityMatchScore/);
  assert.match(source, /function queryMatchScore/);
  assert.match(source, /function mergePoints\(query: string,/);
  assert.match(source, /const localityDiff = localityMatchScore\(query, b\.display\) - localityMatchScore\(query, a\.display\)/);
  assert.match(source, /if \(localityDiff !== 0\) return localityDiff;/);
  assert.match(source, /queryMatchScore\(query, a\.display\)/);
  assert.match(source, /queryMatchScore\(query, b\.display\)/);
  assert.match(source, /return scoreDiff !== 0 \? scoreDiff : \(a\.rank \?\? 2\) - \(b\.rank \?\? 2\)/);
  assert.match(source, /const searchTerms = buildSearchTerms\(term\);/);
  assert.match(source, /await Promise\.all\(searchTerms\.map/);
  assert.match(source, /return mergePoints\(term, photon, nominatim\)/);
});
