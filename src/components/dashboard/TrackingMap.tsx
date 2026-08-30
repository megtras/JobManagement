"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Car, Maximize2, X } from "lucide-react";
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  APILoadingStatus,
} from "@vis.gl/react-google-maps";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface TeamTrackingPoint {
  id: string;
  name: string;
  accountName: string;
  role: "TECHNICIAN" | "MANAGER" | "ADMIN";
  branchId: string;
  branchName: string;
  teamIds: string[];
  teamNames: string[];
  lat: number | null;
  lng: number | null;
  area: string | null;
  address: string | null;
  updatedAt: string | null;
  memberName: string | null;
  trackedMembers: number;
}

const DEFAULT_CENTER: [number, number] = [3.0738, 101.5183];
const GOOGLE_DEFAULT_CENTER = { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
const DEFAULT_ZOOM = 10;
const CARTO_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
const GENPLUS_CAR_GREEN = "#28a89d";
const CAR_PIN_RED = "#ef4444";
const CAR_BODY_RED = "#dc2626";
const TRACKING_ROLE_COLOR: Record<TeamTrackingPoint["role"], string> = {
  TECHNICIAN: "#dc2626",
  MANAGER: "#2563eb",
  ADMIN: "#facc15",
};
// Single source of truth for the tracking marker, shared by the Google
// (AdvancedMarker) and Leaflet renderers. Detailed 3D-style car: glossy panels,
// alloy wheels, head/tail lights, a floating location pin and a live pulse ring.
const CAR_MARKER_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="110" viewBox="0 -16 84 92" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="carBody" x1="14" y1="26" x2="60" y2="54" gradientUnits="userSpaceOnUse">
        <stop stop-color="#8af3ea"/>
        <stop offset=".42" stop-color="#2fbcb0"/>
        <stop offset="1" stop-color="#0a6a62"/>
      </linearGradient>
      <linearGradient id="carLower" x1="14" y1="45" x2="60" y2="56" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0f867b"/>
        <stop offset="1" stop-color="#063f3a"/>
      </linearGradient>
      <linearGradient id="carGlass" x1="26" y1="21" x2="50" y2="34" gradientUnits="userSpaceOnUse">
        <stop stop-color="#bfe9ff"/>
        <stop offset=".5" stop-color="#2b4d70"/>
        <stop offset="1" stop-color="#15263d"/>
      </linearGradient>
      <linearGradient id="carPin" x1="40" y1="0" x2="40" y2="30" gradientUnits="userSpaceOnUse">
        <stop stop-color="#ff8c8c"/>
        <stop offset="1" stop-color="${CAR_PIN_RED}"/>
      </linearGradient>
      <radialGradient id="carHead" cx="0.5" cy="0.5" r="0.6">
        <stop stop-color="#fffced"/>
        <stop offset="1" stop-color="#fbd24e"/>
      </radialGradient>
      <radialGradient id="carWheel" cx="0.42" cy="0.38" r="0.7">
        <stop stop-color="#e7edf4"/>
        <stop offset="1" stop-color="#9aa6b6"/>
      </radialGradient>
    </defs>

    <!-- live pulse on the ground -->
    <ellipse cx="42" cy="60" rx="12" ry="3" fill="none" stroke="${GENPLUS_CAR_GREEN}" stroke-width="2.4" opacity=".5">
      <animate attributeName="rx" values="11;32;11" dur="2.2s" repeatCount="indefinite"/>
      <animate attributeName="ry" values="2.8;7;2.8" dur="2.2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values=".55;0;.55" dur="2.2s" repeatCount="indefinite"/>
    </ellipse>

    <!-- location pin -->
    <g transform="translate(4 -16)">
      <ellipse cx="36" cy="31.4" rx="7.4" ry="1.9" fill="${CAR_BODY_RED}" opacity=".26"/>
      <path d="M36 1.5c-6.4 0-11.6 5-11.6 11.2 0 8.5 11.6 17.6 11.6 17.6s11.6-9.1 11.6-17.6C47.6 6.5 42.4 1.5 36 1.5Z" fill="${CAR_BODY_RED}" stroke="#ffffff" stroke-width="2.4"/>
      <circle cx="36" cy="12.4" r="5.2" fill="#ffffff"/>
      <circle cx="36" cy="12.4" r="2.6" fill="${CAR_BODY_RED}"/>
      <path d="M30.4 8.4c1-1.8 2.9-3 5-3.3" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" opacity=".75"/>
    </g>

    <!-- car (faces right) -->
    <g transform="translate(4 9)">
      <ellipse cx="38" cy="59" rx="31" ry="4.4" fill="#0f172a" opacity=".2"/>

      <!-- wheel wells -->
      <circle cx="24" cy="49.5" r="10.4" fill="#3b1212"/>
      <circle cx="57" cy="49.5" r="10.4" fill="#3b1212"/>

      <!-- rocker / lower body -->
      <path d="M9 45.6c.3-2.4 2.2-3.6 5.4-3.6h47.8c4.6 0 8.6 1.1 9.8 4 .7 1.8.4 5.1-2.7 5.4H11.6c-2.6 0-3.2-2.6-2.6-5.8Z" fill="${CAR_BODY_RED}"/>

      <!-- main body (solid, no outline) -->
      <path d="M8.4 43.6c1-7 6.2-11.3 14.4-11.9l6-8.8c1.2-1.9 3.3-3 5.6-3h13.6c4.5 0 8.6 2.5 10.6 6.5l2.4 4.6 4.8 1.1c4.1.9 6.9 4.6 6.9 8.7v2.9c0 2.5-1.9 3.7-4.4 3.7H11.9c-2.5 0-4.3-1.1-3.7-3.6l.2-.2Z" fill="${CAR_BODY_RED}"/>

      <!-- character line -->
      <path d="M11 43.2h54" stroke="#7f1d1d" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>

      <!-- greenhouse glass + B-pillar + reflection -->
      <path d="M29.8 23.3h15.9c3.1 0 5.9 1.7 7.4 4.4l2 3.9H22.4l7.4-8.3Z" fill="#1f2d44"/>
      <path d="M37.8 23.3v8.0" stroke="#0b3a55" stroke-width="1.7"/>

      <!-- side mirror -->
      <path d="M50.6 30c1.7-.5 3.4-.2 4.3.8-1.1 1-2.8 1.2-4.3.7Z" fill="${CAR_BODY_RED}"/>
      <!-- door handle + seam -->
      <path d="M33.6 38.4h5.6" stroke="#d4fbf5" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>
      <path d="M40 32.6v9.6" stroke="#054b46" stroke-width=".8" opacity=".45"/>

      <!-- headlight (front) + taillight (rear) -->
      <path d="M63.6 35.8l5.8 1c1.5.3 2.6 1.4 2.9 2.8l-8.2-.4-.5-3.4Z" fill="#fde68a"/>
      <path d="M7.6 39.8l3.6-.2.3 3.8-4.2-.2c-.6-1.2-.3-2.6.3-3.4Z" fill="${CAR_PIN_RED}"/>

      <!-- 5-spoke alloy wheels -->
      <g transform="translate(24 49.5)">
        <circle r="8.6" fill="#141a24"/>
        <circle r="5.1" fill="#cbd5e1"/>
        <g fill="#828ea0">
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9"/>
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9" transform="rotate(72)"/>
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9" transform="rotate(144)"/>
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9" transform="rotate(216)"/>
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9" transform="rotate(288)"/>
        </g>
        <circle r="1.9" fill="#586477" stroke="#aeb8c6" stroke-width=".5"/>
      </g>
      <g transform="translate(57 49.5)">
        <circle r="8.6" fill="#141a24"/>
        <circle r="5.1" fill="#cbd5e1"/>
        <g fill="#828ea0">
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9"/>
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9" transform="rotate(72)"/>
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9" transform="rotate(144)"/>
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9" transform="rotate(216)"/>
          <rect x="-.95" y="-4.7" width="1.9" height="4" rx=".9" transform="rotate(288)"/>
        </g>
        <circle r="1.9" fill="#586477" stroke="#aeb8c6" stroke-width=".5"/>
      </g>
    </g>
  </svg>
`;

function buildCarMarkerSvg(role: TeamTrackingPoint["role"]) {
  const color = TRACKING_ROLE_COLOR[role] ?? TRACKING_ROLE_COLOR.TECHNICIAN;
  return CAR_MARKER_SVG
    .replaceAll(CAR_BODY_RED, color)
    .replaceAll(GENPLUS_CAR_GREEN, color);
}

function CAR_MARKER_HTML(role: TeamTrackingPoint["role"]) {
  return `<div style="width:100px;height:110px;filter:drop-shadow(0 10px 12px rgba(15,23,42,.34));">${buildCarMarkerSvg(role)}</div>`;
}

function hasLeafletMap(container: HTMLDivElement) {
  return Boolean((container as HTMLDivElement & { _leaflet_id?: number })._leaflet_id);
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "No location yet";
  return new Date(value).toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role: TeamTrackingPoint["role"]) {
  if (role === "TECHNICIAN") return "Team / Technician";
  if (role === "MANAGER") return "Manager";
  return "Admin";
}

function trackedOnly(points: TeamTrackingPoint[]) {
  return points.filter((point) => point.lat != null && point.lng != null);
}

function GoogleTrackingBounds({ points }: { points: TeamTrackingPoint[] }) {
  const map = useMap();
  const trackedPoints = useMemo(() => trackedOnly(points), [points]);

  useEffect(() => {
    if (!map) return;
    if (trackedPoints.length === 0) {
      map.setCenter(GOOGLE_DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
      return;
    }

    if (trackedPoints.length === 1) {
      map.setCenter({ lat: trackedPoints[0].lat!, lng: trackedPoints[0].lng! });
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    trackedPoints.forEach((point) => bounds.extend({ lat: point.lat!, lng: point.lng! }));
    map.fitBounds(bounds, 40);
  }, [map, trackedPoints]);

  return null;
}

function ModernCarMarkerShape({ role }: { role: TeamTrackingPoint["role"] }) {
  return (
    <div
      className="h-[110px] w-[100px] drop-shadow-[0_10px_12px_rgba(15,23,42,0.34)]"
      dangerouslySetInnerHTML={{ __html: buildCarMarkerSvg(role) }}
    />
  );
}

function GoogleTrackingMap({ points, className }: { points: TeamTrackingPoint[]; className: string }) {
  const status = useApiLoadingStatus();
  const trackedPoints = useMemo(() => trackedOnly(points), [points]);
  const [selectedPoint, setSelectedPoint] = useState<TeamTrackingPoint | null>(null);
  const hasFailed = status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE;

  return (
    <div className={`relative ${className}`}>
      {hasFailed ? (
        <div className="flex h-full w-full items-center justify-center bg-gray-50 text-sm text-gray-500">
          Google Maps could not load.
        </div>
      ) : (
        <GoogleMap
          defaultCenter={GOOGLE_DEFAULT_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          mapId={GOOGLE_MAPS_MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          style={{ width: "100%", height: "100%" }}
        >
          <GoogleTrackingBounds points={points} />
          {trackedPoints.map((point) => (
            <AdvancedMarker
              key={point.id}
              position={{ lat: point.lat!, lng: point.lng! }}
              onClick={() => setSelectedPoint(point)}
            >
              <ModernCarMarkerShape role={point.role} />
            </AdvancedMarker>
          ))}
        </GoogleMap>
      )}

      {selectedPoint && (
        <div className="absolute left-3 top-3 max-w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{selectedPoint.accountName}</p>
              <p className="mt-0.5 text-xs font-medium text-gray-500">
                {roleLabel(selectedPoint.role)} - {selectedPoint.branchName}
              </p>
              {selectedPoint.teamNames.length > 0 && (
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {selectedPoint.teamNames.join(", ")}
                </p>
              )}
              <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                {selectedPoint.area || selectedPoint.address || "Area not detected yet"}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                {formatUpdatedAt(selectedPoint.updatedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPoint(null)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close tracking details"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeafletTrackingMap({ points, className }: { points: TeamTrackingPoint[]; className: string }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);

  const trackedPoints = useMemo(() => trackedOnly(points), [points]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current || hasLeafletMap(container)) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;

    import("leaflet").then((L) => {
      const currentContainer = mapContainerRef.current;
      if (!currentContainer || cancelled || mapRef.current || hasLeafletMap(currentContainer)) return;

      leafletRef.current = L;
      const map = L.map(currentContainer, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer(CARTO_TILE_URL, {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);

      mapRef.current = map;
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(currentContainer);
      setReady(true);
      setTimeout(() => map.invalidateSize(), 150);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !ready) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (trackedPoints.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    for (const point of trackedPoints) {
      const icon = L.divIcon({
        html: CAR_MARKER_HTML(point.role),
        className: "",
        iconSize: [100, 110],
        iconAnchor: [50, 100],
        popupAnchor: [0, -100],
      });
      const marker = L.marker([point.lat!, point.lng!], { icon }).addTo(map);
      const popup = document.createElement("div");
      popup.className = "min-w-44 space-y-1";
      popup.innerHTML = "";

      const title = document.createElement("p");
      title.className = "font-semibold text-gray-900";
      title.textContent = point.accountName;
      popup.appendChild(title);

      const owner = document.createElement("p");
      owner.className = "text-xs font-medium text-gray-500";
      owner.textContent = `${roleLabel(point.role)} - ${point.branchName}`;
      popup.appendChild(owner);

      if (point.teamNames.length > 0) {
        const teams = document.createElement("p");
        teams.className = "text-xs text-gray-500";
        teams.textContent = point.teamNames.join(", ");
        popup.appendChild(teams);
      }

      const area = document.createElement("p");
      area.className = "text-xs text-gray-600";
      area.textContent = point.area || point.address || "Area not detected yet";
      popup.appendChild(area);

      const meta = document.createElement("p");
      meta.className = "text-[11px] text-gray-400";
      meta.textContent = formatUpdatedAt(point.updatedAt);
      popup.appendChild(meta);

      marker.bindPopup(popup);
      markersRef.current.push(marker);
    }

    map.invalidateSize();
    if (trackedPoints.length === 1) {
      map.setView([trackedPoints[0].lat!, trackedPoints[0].lng!], 14);
    } else {
      const bounds = L.latLngBounds(trackedPoints.map((point) => [point.lat!, point.lng!] as [number, number]));
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    }
  }, [ready, trackedPoints]);

  return <div ref={mapContainerRef} className={className} />;
}

function TrackingMapView({ points, className }: { points: TeamTrackingPoint[]; className: string }) {
  const [googleMapsFailed, setGoogleMapsFailed] = useState(false);

  if (!GOOGLE_MAPS_API_KEY || !GOOGLE_MAPS_MAP_ID) {
    return <LeafletTrackingMap points={points} className={className} />;
  }

  if (googleMapsFailed) {
    return <LeafletTrackingMap points={points} className={className} />;
  }

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={["marker"]}
      onError={() => setGoogleMapsFailed(true)}
    >
      <GoogleTrackingMap points={points} className={className} />
    </APIProvider>
  );
}

export function TrackingPanel({ points, label }: { points: TeamTrackingPoint[]; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const trackedCount = points.filter((point) => point.lat != null && point.lng != null).length;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Car className="h-4 w-4 text-teal-600" />
              Tracking
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              {trackedCount} of {points.length} account{points.length === 1 ? "" : "s"} online {label ? `- ${label}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            View
          </button>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-gray-200">
          <TrackingMapView points={points} className="h-64 w-full" />
          {trackedCount === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 px-4 text-center text-sm text-gray-500">
              No account location available yet.
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[86vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                  <Car className="h-4 w-4 text-teal-600" />
                  Tracking
                </h3>
                <p className="text-xs text-gray-400">{trackedCount} active account location{trackedCount === 1 ? "" : "s"}</p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close tracking map"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <TrackingMapView points={points} className="h-full w-full rounded-b-2xl" />
              {trackedCount === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 px-4 text-center text-sm text-gray-500">
                  No account location available yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
