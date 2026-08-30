"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface Props {
  lat?: number | null;
  lng?: number | null;
  onLocationChange: (lat: number, lng: number, address: string) => void;
}

const DEFAULT_CENTER: [number, number] = [3.139, 101.6869];
const DEFAULT_ZOOM = 12;

export default function LocationPicker({ lat, lng, onLocationChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    // Guard against React Strict Mode double-invoke and re-init on same DOM node
    if (!mapRef.current || leafletMap.current || (mapRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) return;
    import("leaflet").then((L) => {
      if (!mapRef.current) return;
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        className: "", iconSize: [24, 24], iconAnchor: [12, 12],
      });
      const map = L.map(mapRef.current, { center: lat && lng ? [lat, lng] : DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(map);

      if (lat && lng) {
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current!.getLatLng();
          doGeocode(p.lat, p.lng);
        });
      }

      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        const { lat: la, lng: ln } = e.latlng;
        if (markerRef.current) { markerRef.current.setLatLng([la, ln]); }
        else {
          markerRef.current = L.marker([la, ln], { icon, draggable: true }).addTo(map);
          markerRef.current.on("dragend", () => {
            const p = markerRef.current!.getLatLng();
            doGeocode(p.lat, p.lng);
          });
        }
        doGeocode(la, ln);
      });
      leafletMap.current = map;
    });
    return () => { leafletMap.current?.remove(); leafletMap.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doGeocode(lat: number, lng: number) {
    setGeocoding(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      onLocationChange(lat, lng, data.display_name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    } catch {
      onLocationChange(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    } finally { setGeocoding(false); }
  }

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-56 rounded-xl overflow-hidden border border-gray-200 z-0" />
      {geocoding && (
        <div className="absolute top-2 right-2 bg-white rounded-lg px-2 py-1 flex items-center gap-1.5 text-xs text-gray-600 shadow">
          <Loader2 className="w-3 h-3 animate-spin" /> Looking up address...
        </div>
      )}
      <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
        <MapPin className="w-3 h-3" /> Click on the map to set the location
      </p>
    </div>
  );
}
