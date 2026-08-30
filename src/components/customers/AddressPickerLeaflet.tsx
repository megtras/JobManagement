"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, MapPin, Loader2, Search } from "lucide-react";
import type { Map, Marker, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  onAdd: (address: string, lat: number | null, lng: number | null, district?: string) => void;
  onClose: () => void;
}

const DEFAULT_CENTER: [number, number] = [3.0738, 101.5183];
const DEFAULT_ZOOM = 10;
const SEARCH_DEBOUNCE_MS = 700;
const CARTO_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

// Photon (OSM-based) geocoder — far better than Nominatim at partial / business
// / building-name search and type-ahead. Free, no API key.
const PHOTON_URL = "https://photon.komoot.io";
// Bias results toward Selangor/KL. Higher scale = stronger local preference.
const BIAS_LAT = "3.0738";
const BIAS_LON = "101.5183";
const BIAS_SCALE = "0.3";
const RESULT_LIMIT = "12";
// Selangor/KL bounding box (left,top,right,bottom) for the Nominatim fallback.
const NOMINATIM_VIEWBOX = "100.7,3.9,102.0,2.5";
const SEARCH_TOKEN_ALIASES = {
  jln: "jalan",
  jlnn: "jalan",
  jlnr: "jalan",
  jl: "jalan",
  tmn: "taman",
  bdr: "bandar",
  seksyen: "seksyen",
  seks: "seksyen",
  sek: "seksyen",
  pju: "petalingjayautama",
} as const;
const STREET_FRAGMENT_PATTERN = /\b\d+[a-z]?\/\d+[a-z0-9-]*\b/gi;
const STREET_NAME_PATTERN = /\b(?:jalan|jln)\s+(\d+[a-z]?\/\d+[a-z0-9-]*)\b/i;

type PhotonProps = {
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
};
type PhotonFeature = {
  geometry: { coordinates: [number, number] }; // [lon, lat]
  properties: PhotonProps;
};

type Point = { lat: number; lng: number; display: string; rank?: number; district?: string };

function hasLeafletMap(container: HTMLDivElement) {
  return Boolean((container as HTMLDivElement & { _leaflet_id?: number })._leaflet_id);
}

function makeIcon(L: typeof import("leaflet"), selected: boolean) {
  const size = selected ? 30 : 20;
  const color = selected ? "#dc2626" : "#2563eb";
  const border = selected ? 4 : 3;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border}px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.45);cursor:pointer;"></div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Build a single readable address line from Photon's structured fields.
function formatPhoton(p: PhotonProps): string {
  const line1 = [p.housenumber, p.street].filter(Boolean).join(" ");
  const raw = [p.name, line1, p.district, p.city, p.county, p.state, p.postcode, p.country]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of raw) {
    if (out[out.length - 1]?.toLowerCase() !== s.toLowerCase()) out.push(s);
  }
  return out.join(", ");
}

// The "District" / area for the customer — the recognisable town/city, falling
// back to the administrative district. e.g. "Cyberjaya", "Petaling Jaya".
function pickDistrict(p: PhotonProps): string {
  return (p.city || p.county || p.district || "").trim();
}

// Selangor first, then Kuala Lumpur, then the rest of Malaysia.
function rankByPlace(state: string, city: string): number {
  const s = state.toLowerCase();
  const c = city.toLowerCase();
  if (s.includes("selangor")) return 0;
  if (s.includes("kuala lumpur") || c.includes("kuala lumpur")) return 1;
  return 2;
}

function normalizeSearchText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .map((token) => SEARCH_TOKEN_ALIASES[token as keyof typeof SEARCH_TOKEN_ALIASES] ?? token)
    .filter((token) => token.length >= 2);
}

function splitSearchSegments(value: string): string[] {
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function extractStreetSearchTerm(segment: string): string | null {
  const streetMatch = segment.match(STREET_NAME_PATTERN);
  const streetFragment = streetMatch?.[1] ?? segment.match(STREET_FRAGMENT_PATTERN)?.[0];
  if (!streetFragment) return null;
  return `jalan ${streetFragment.toLowerCase()}`;
}

function extractStreetFragments(value: string): string[] {
  return Array.from(new Set(value.toLowerCase().match(STREET_FRAGMENT_PATTERN) ?? []));
}

function buildSearchTerms(query: string): string[] {
  const terms = [query];
  const seen = new Set(terms.map((term) => term.toLowerCase()));
  const segments = splitSearchSegments(query);
  const streetSegment = segments.find((segment) => /jalan|jln|\/|\d+[a-z]?\/\d+/i.test(segment));
  const exactStreetTerm = streetSegment ? extractStreetSearchTerm(streetSegment) : null;
  const localitySegments = segments.slice(1).filter((segment) => segment !== streetSegment);
  const combinedLocality = localitySegments.join(", ").trim();

  for (const segment of segments.slice(1)) {
    if (segment.length < 3) continue;
    const normalizedSegment = segment.toLowerCase();
    if (seen.has(normalizedSegment)) continue;
    seen.add(normalizedSegment);
    terms.push(segment);
  }

  if (exactStreetTerm) {
    const normalizedExactStreetTerm = exactStreetTerm.toLowerCase();
    if (!seen.has(normalizedExactStreetTerm)) {
      seen.add(normalizedExactStreetTerm);
      terms.push(exactStreetTerm);
    }

    if (combinedLocality) {
      const streetWithLocality = `${exactStreetTerm}, ${combinedLocality}`;
      const normalizedStreetWithLocality = streetWithLocality.toLowerCase();
      if (!seen.has(normalizedStreetWithLocality)) {
        seen.add(normalizedStreetWithLocality);
        terms.push(`${exactStreetTerm}, ${combinedLocality}`);
      }
    }
  }

  return terms;
}

function exactAddressFragmentScore(query: string, display: string): number {
  const queryFragments = extractStreetFragments(query);
  if (queryFragments.length === 0) return 0;

  const haystack = display.toLowerCase();
  let score = 0;

  for (const fragment of queryFragments) {
    if (haystack.includes(fragment)) {
      score += 40;
    }
  }

  return score;
}

function streetFragmentMismatchScore(query: string, display: string): number {
  const queryFragments = extractStreetFragments(query);
  if (queryFragments.length === 0) return 0;

  const displayFragments = extractStreetFragments(display);
  if (displayFragments.length === 0) return 0;

  const matched = displayFragments.some((fragment) => queryFragments.includes(fragment));
  if (matched) return 20;

  return -80;
}

function localityMatchScore(query: string, display: string): number {
  const localitySegments = splitSearchSegments(query).slice(1);
  if (localitySegments.length === 0) return 0;

  const displayTokens = new Set(normalizeSearchText(display));
  let score = 0;
  let matchedSegments = 0;

  for (const segment of localitySegments) {
    const tokens = normalizeSearchText(segment).filter((token) => token.length >= 3 || /^\d+$/.test(token));
    if (tokens.length === 0) continue;

    const matchedCount = tokens.filter((token) => displayTokens.has(token)).length;
    if (matchedCount === tokens.length) {
      matchedSegments += 1;
      score += 18 + (tokens.length * 4);
      continue;
    }

    if (matchedCount > 0) {
      score += (matchedCount * 4) - ((tokens.length - matchedCount) * 7);
      continue;
    }

    score -= Math.min(18, tokens.length * 6);
  }

  if (matchedSegments === 0) {
    score -= 20;
  }

  return score;
}

function queryMatchScore(query: string, display: string): number {
  const queryTokens = normalizeSearchText(query);
  if (queryTokens.length === 0) return 0;

  const haystack = ` ${display.toLowerCase()} `;
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.includes(` ${token} `)) {
      score += token.length >= 6 ? 8 : 5;
    } else if (haystack.includes(token)) {
      score += token.length >= 6 ? 5 : 3;
    }
  }

  return score;
}

// Primary geocoder — great at partial / business / building names.
async function photonSearch(q: string): Promise<Point[]> {
  const params = new URLSearchParams({
    q,
    limit: RESULT_LIMIT,
    lat: BIAS_LAT,
    lon: BIAS_LON,
    location_bias_scale: BIAS_SCALE,
    lang: "en",
  });
  const res = await fetch(`${PHOTON_URL}/api/?${params.toString()}`);
  const raw = await res.json();
  const feats: PhotonFeature[] = Array.isArray(raw?.features) ? raw.features : [];
  return feats
    .filter((f) => (f.properties.countrycode ?? "").toUpperCase() === "MY")
    .map((f) => ({
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      display: formatPhoton(f.properties),
      district: pickDistrict(f.properties),
      rank: rankByPlace(f.properties.state ?? "", f.properties.city ?? ""),
    }));
}

type NominatimResult = {
  lat: string; lon: string; display_name: string;
  address?: { state?: string; city?: string; town?: string; county?: string; district?: string };
};

// Secondary geocoder — a different OSM index that often maps branches Photon
// misses, so we merge the two to surface every nearby shop point.
async function nominatimSearch(q: string): Promise<Point[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "my",
    viewbox: NOMINATIM_VIEWBOX,
    bounded: "0",
    limit: "12",
    "accept-language": "ms",
    q,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  const raw = await res.json();
  const arr: NominatimResult[] = Array.isArray(raw) ? raw : [];
  return arr
    .map((r) => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      display: r.display_name,
      district: (r.address?.city || r.address?.town || r.address?.county || r.address?.district || "").trim(),
      rank: rankByPlace(r.address?.state ?? "", r.address?.city ?? ""),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

// Merge results from both geocoders, drop near-duplicate pins (~11 m), and
// order Selangor → KL → rest of Malaysia.
function mergePoints(query: string, ...lists: Point[][]): Point[] {
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const p of lists.flat()) {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.sort((a, b) => {
    const streetFragmentDiff = exactAddressFragmentScore(query, b.display) - exactAddressFragmentScore(query, a.display);
    if (streetFragmentDiff !== 0) return streetFragmentDiff;

    const streetMismatchDiff = streetFragmentMismatchScore(query, b.display) - streetFragmentMismatchScore(query, a.display);
    if (streetMismatchDiff !== 0) return streetMismatchDiff;

    const localityDiff = localityMatchScore(query, b.display) - localityMatchScore(query, a.display);
    if (localityDiff !== 0) return localityDiff;

    const scoreDiff = queryMatchScore(query, b.display) - queryMatchScore(query, a.display);
    return scoreDiff !== 0 ? scoreDiff : (a.rank ?? 2) - (b.rank ?? 2);
  });
}

export function AddressPickerLeaflet({ onAdd, onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const leafletMap = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const resultsRef = useRef<Point[]>([]);
  const selectedIdxRef = useRef<number | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const mapClickRef = useRef<(lat: number, lng: number) => void>(() => {});
  const latestSearchRef = useRef(0);
  const latestReverseRef = useRef(0);
  const [query, setQuery] = useState("");
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [resultCount, setResultCount] = useState(0);
  const [searchResults, setSearchResults] = useState<Point[]>([]);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState("");

  // Focus the search field as soon as the modal opens so the user can type
  // immediately without clicking into it first.
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current || hasLeafletMap(mapRef.current)) return;

    let observer: ResizeObserver | null = null;
    let cancelled = false;

    import("leaflet").then((L) => {
      const container = mapRef.current;
      if (!container || cancelled || leafletMap.current || hasLeafletMap(container)) return;

      leafletRef.current = L;

      const map = L.map(container, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
      L.tileLayer(CARTO_TILE_URL, {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);

      // Tap anywhere on the map to drop a pin manually (fallback when a shop
      // is not in OpenStreetMap).
      map.on("click", (e: LeafletMouseEvent) => mapClickRef.current(e.latlng.lat, e.latlng.lng));

      leafletMap.current = map;

      // Resize observer ensures tiles fill the container whenever size changes
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(container);
      setTimeout(() => map.invalidateSize(), 150);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      leafletMap.current?.remove();
      leafletMap.current = null;
      markersRef.current = [];
      resultsRef.current = [];
      leafletRef.current = null;
    };
  }, []);

  // Select one of the pins: highlight it, make it draggable, fill the address
  // box, and centre the map on it.
  const selectResult = useCallback((idx: number, closeResults = true) => {
    const L = leafletRef.current;
    const map = leafletMap.current;
    if (!L || !map) return;

    selectedIdxRef.current = idx;
    markersRef.current.forEach((m, i) => {
      m.setIcon(makeIcon(L, i === idx));
      if (i === idx) {
        m.dragging?.enable();
        m.setZIndexOffset(1000);
      } else {
        m.dragging?.disable();
        m.setZIndexOffset(0);
      }
    });

    const pt = resultsRef.current[idx];
    if (pt) {
      setAddress(pt.display);
      setCoords({ lat: pt.lat, lng: pt.lng });
      setSelectedDistrict(pt.district ?? "");
      map.panTo([pt.lat, pt.lng]);
      if (closeResults) setResultsOpen(false);
    }
  }, []);

  // After the selected pin is dragged (or a manual pin is dropped), update
  // coords immediately and reverse-geocode the new spot.
  const handleMarkerDragged = useCallback(async (idx: number, lat: number, lng: number) => {
    const prev = resultsRef.current[idx];
    resultsRef.current[idx] = { lat, lng, display: prev?.display ?? "" };
    selectResult(idx);
    setCoords({ lat, lng });

    const reqId = latestReverseRef.current + 1;
    latestReverseRef.current = reqId;
    setSearching(true);
    try {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), limit: "1", lang: "en" });
      const res = await fetch(`${PHOTON_URL}/reverse?${params.toString()}`);
      const data = await res.json();
      if (reqId !== latestReverseRef.current) return;
      const feat = data?.features?.[0] as PhotonFeature | undefined;
      const display = (feat && formatPhoton(feat.properties)) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const district = feat ? pickDistrict(feat.properties) : "";
      resultsRef.current[idx] = { lat, lng, display, district };
      setSearchResults([...resultsRef.current]);
      setAddress(display);
      setSelectedDistrict(district);
    } catch { /* ignore */ }
    finally {
      if (reqId === latestReverseRef.current) setSearching(false);
    }
  }, [selectResult]);

  // Drop a pin for every search result and fit the map to show them all.
  const renderResults = useCallback((pts: Point[]) => {
    const L = leafletRef.current;
    const map = leafletMap.current;
    if (!L || !map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    resultsRef.current = pts;
    setSearchResults(pts);
    setResultsOpen(pts.length > 0);
    setResultCount(pts.length);

    if (pts.length === 0) {
      selectedIdxRef.current = null;
      setAddress("");
      setSearchResults([]);
      setResultsOpen(false);
      setCoords(null);
      setSelectedDistrict("");
      setNotFound(true);
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    setNotFound(false);

    pts.forEach((p, i) => {
      const m = L.marker([p.lat, p.lng], { icon: makeIcon(L, false), draggable: false }).addTo(map);
      m.on("click", () => selectResult(i));
      m.on("dragend", () => {
        const ll = m.getLatLng();
        void handleMarkerDragged(i, ll.lat, ll.lng);
      });
      markersRef.current.push(m);
    });

    map.invalidateSize();
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 16);
    } else {
      const bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }

    selectResult(0, false); // auto-pick the best hit while keeping the dropdown available.
  }, [selectResult, handleMarkerDragged]);

  // Manual pin from tapping the map — replaces results with one draggable pin.
  const placeManualPin = useCallback((lat: number, lng: number) => {
    const L = leafletRef.current;
    const map = leafletMap.current;
    if (!L || !map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    resultsRef.current = [{ lat, lng, display: "" }];
    setSearchResults([]);
    setResultsOpen(false);
    setResultCount(1);
    setNotFound(false);

    const m = L.marker([lat, lng], { icon: makeIcon(L, true), draggable: true }).addTo(map);
    m.on("click", () => selectResult(0));
    m.on("dragend", () => {
      const ll = m.getLatLng();
      void handleMarkerDragged(0, ll.lat, ll.lng);
    });
    markersRef.current.push(m);
    selectedIdxRef.current = 0;

    void handleMarkerDragged(0, lat, lng); // reverse-geocode the dropped spot
  }, [selectResult, handleMarkerDragged]);

  // Keep the map-click handler pointing at the latest callback.
  mapClickRef.current = placeManualPin;

  const searchAddress = useCallback(async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;

    const requestId = latestSearchRef.current + 1;
    latestSearchRef.current = requestId;
    setSearching(true);
    setNotFound(false);

    // Query both geocoders in parallel and merge, so every mapped branch of a
    // shop shows up as its own pin. If a comma query finds nothing, retry each
    // segment — keeps single areas reliable and recovers combined queries.
    const gather = async (term: string) => {
      const searchTerms = buildSearchTerms(term);
      const searches = await Promise.all(searchTerms.map(async (searchTerm) => {
        const [photon, nominatim] = await Promise.all([photonSearch(searchTerm), nominatimSearch(searchTerm)]);
        return { photon, nominatim };
      }));
      const photon = searches.flatMap((result) => result.photon);
      const nominatim = searches.flatMap((result) => result.nominatim);
      return mergePoints(term, photon, nominatim);
    };

    try {
      let pts = await gather(q);
      if (requestId !== latestSearchRef.current) return;

      if (pts.length === 0 && q.includes(",")) {
        for (const seg of q.split(",").map((s) => s.trim()).filter(Boolean)) {
          pts = await gather(seg);
          if (requestId !== latestSearchRef.current) return;
          if (pts.length) break;
        }
      }
      renderResults(pts);
    } catch { /* ignore */ }
    finally {
      if (requestId === latestSearchRef.current) setSearching(false);
    }
  }, [renderResults]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setResultsOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      void searchAddress(trimmedQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, searchAddress]);

  function handleSearch() {
    void searchAddress(query);
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" /> Add Address
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="relative">
            <div className="flex gap-2">
              <input
                ref={searchInputRef}
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  if (searchResults.length > 0) setResultsOpen(true);
                }}
                onFocus={() => searchResults.length > 0 && setResultsOpen(true)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="Search shop name / building / address..."
                className="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                disabled={searching || !query.trim()}
                className="px-3 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 transition"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {resultsOpen && searchResults.length > 0 && (
              <ul className="absolute z-30 mt-1 w-[calc(100%-3rem)] max-h-52 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {searchResults.map((result, idx) => (
                  <li key={`${result.lat.toFixed(5)}-${result.lng.toFixed(5)}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => selectResult(idx)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition"
                    >
                      <Search className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                      <span className="line-clamp-2 text-gray-700">{result.display}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div ref={mapRef} className="w-full h-56 rounded-xl overflow-hidden border border-gray-200" />

          {resultCount > 0 ? (
            <p className="text-xs text-gray-500">
              Found <span className="font-medium text-gray-700">{resultCount}</span> location{resultCount === 1 ? "" : "s"}
              {resultCount > 1 ? " - tap a pin to select it" : ""} - drag the red pin to fine-tune the exact position.
            </p>
          ) : (
            <p className="text-xs text-gray-400">
              Type a shop or building name, or <span className="font-medium text-gray-600">tap on the map</span> to place your own pin.
            </p>
          )}

          {address && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 line-clamp-2">
              {address}
            </p>
          )}

          {notFound && !address && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
              No results found in Malaysia. Try a different keyword, or tap directly on the map to place a location pin.
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => { onAdd(address || query, coords?.lat ?? null, coords?.lng ?? null, selectedDistrict); onClose(); }}
            disabled={!address && !query.trim()}
            className="flex-1 py-2.5 rounded-lg bg-[#28a89d] hover:bg-[#1f8c82] disabled:bg-[#28a89d]/50 text-white text-sm font-medium transition"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
