"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, MapPin, Loader2, Search, LocateFixed, AlertTriangle } from "lucide-react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
  useApiLoadingStatus,
  APILoadingStatus,
} from "@vis.gl/react-google-maps";

interface Props {
  onAdd: (address: string, lat: number | null, lng: number | null, district?: string) => void;
  onClose: () => void;
  onFallbackToLeaflet?: () => void;
}

// Same contract + look as the Leaflet picker, so the two are drop-in swappable.
const DEFAULT_CENTER = { lat: 3.0738, lng: 101.5183 }; // Klang Valley / Selangor
const DEFAULT_ZOOM = 11;
const SEARCH_DEBOUNCE_MS = 300;

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
// AdvancedMarker requires a Map ID (create one in Cloud Console → Map Management).
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

type LatLng = { lat: number; lng: number };

// The customer "District" — recognisable town/city, then administrative district.
function districtFromPlace(components?: google.maps.places.AddressComponent[]): string {
  if (!components) return "";
  const find = (type: string) => components.find((c) => c.types.includes(type))?.longText ?? "";
  return find("locality") || find("administrative_area_level_2") || find("sublocality") || "";
}

function districtFromGeocoder(components: google.maps.GeocoderAddressComponent[]): string {
  const find = (type: string) => components.find((c) => c.types.includes(type))?.long_name ?? "";
  return find("locality") || find("administrative_area_level_2") || find("sublocality") || "";
}

export function AddressPickerGoogle({ onAdd, onClose, onFallbackToLeaflet }: Props) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg md:max-w-3xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" /> Add Address
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!API_KEY || !MAP_ID ? (
          <NotConfigured onClose={onClose} missingKey={!API_KEY} missingMapId={!MAP_ID} />
        ) : (
          <APIProvider apiKey={API_KEY} libraries={["places", "geocoding", "marker"]} onError={() => onFallbackToLeaflet?.()}>
            <PickerBody onAdd={onAdd} onClose={onClose} onFallbackToLeaflet={onFallbackToLeaflet} />
          </APIProvider>
        )}
      </div>
    </div>
  );
}

function NotConfigured({
  onClose,
  missingKey,
  missingMapId,
}: {
  onClose: () => void;
  missingKey: boolean;
  missingMapId: boolean;
}) {
  return (
    <>
      <div className="px-6 py-6">
        <div className="flex items-start gap-3 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3 border border-amber-100">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Google Maps is not configured.</p>
            <p className="mt-1 text-amber-600">
              Missing{" "}
              {[missingKey && "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", missingMapId && "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID"]
                .filter(Boolean)
                .join(" and ")}
              . Add it to your .env, or set <code className="font-mono">NEXT_PUBLIC_MAPS_PROVIDER=leaflet</code> to use
              the previous map picker.
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-3 px-6 pb-5">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Close
        </button>
      </div>
    </>
  );
}

function PickerBody({ onAdd, onClose, onFallbackToLeaflet }: Props) {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const geocodingLib = useMapsLibrary("geocoding");
  const status = useApiLoadingStatus();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const justSelectedRef = useRef(false);
  const previewSeqRef = useRef(0);
  const lastPreviewedIdRef = useRef<string | null>(null);

  const [query, setQuery] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [searchError, setSearchError] = useState("");

  const authFailed = status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED;

  // Focus the search field as soon as the modal opens.
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!authFailed || !onFallbackToLeaflet) return;
    onFallbackToLeaflet();
  }, [authFailed, onFallbackToLeaflet]);

  // Reverse-geocode any free coordinate (drag, map tap, GPS) to a readable line.
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!geocodingLib) return;
      if (!geocoderRef.current) geocoderRef.current = new geocodingLib.Geocoder();
      setSearching(true);
      try {
        const { results } = await geocoderRef.current.geocode({ location: { lat, lng } });
        const top = results[0];
        if (top) {
          setAddress(top.formatted_address);
          setQuery(top.formatted_address);
          justSelectedRef.current = true; // don't re-open the dropdown for this text
          setDistrict(districtFromGeocoder(top.address_components));
        }
      } catch {
        /* keep the raw coordinate as the address fallback */
        const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setAddress((prev) => prev || fallback);
      } finally {
        setSearching(false);
      }
    },
    [geocodingLib]
  );

  // Resolve a prediction's coordinate and move the map there. Shared by the live
  // "follow as you type" preview and the explicit pick below. seq guards against a
  // newer keystroke landing after a slower preview fetch.
  const goToPrediction = useCallback(
    async (prediction: google.maps.places.PlacePrediction, zoom: number, seq?: number) => {
      const place = prediction.toPlace();
      try {
        await place.fetchFields({ fields: ["location", "formattedAddress", "addressComponents"] });
      } catch {
        return;
      }
      if (seq !== undefined && seq !== previewSeqRef.current) return; // superseded
      const loc = place.location;
      if (!loc) return;
      const next = { lat: loc.lat(), lng: loc.lng() };
      setCoords(next);
      setAddress(place.formattedAddress ?? prediction.text.text);
      setDistrict(districtFromPlace(place.addressComponents));
      map?.panTo(next);
      map?.setZoom(zoom);
    },
    [map]
  );

  // Type-ahead via the current Places API (AutocompleteSuggestion), Malaysia-biased.
  const runAutocomplete = useCallback(
    async (input: string) => {
      if (!placesLib || !input.trim()) {
        setSuggestions([]);
        lastPreviewedIdRef.current = null;
        return;
      }
      if (!sessionTokenRef.current) sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
      setSearching(true);
      setSearchError("");
      try {
        const { suggestions: results } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: ["my"],
          sessionToken: sessionTokenRef.current,
          // Places API caps the bias-circle radius at 50,000 m — going over returns HTTP 400.
          locationBias: { center: DEFAULT_CENTER, radius: 50000 },
        });
        const preds = results
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => p !== null);
        setSuggestions(preds);
        // Follow as you type: move the map to the best match — but only when it
        // actually changes, so we don't re-fetch the same place every keystroke.
        const top = preds[0];
        if (top && top.placeId !== lastPreviewedIdRef.current) {
          lastPreviewedIdRef.current = top.placeId;
          const seq = previewSeqRef.current + 1;
          previewSeqRef.current = seq;
          void goToPrediction(top, 17, seq);
        }
      } catch (e) {
        setSuggestions([]);
        // Surface the cause — most often "Places API (New)" not enabled, or billing.
        setSearchError(e instanceof Error ? e.message : "Address search failed.");
      } finally {
        setSearching(false);
      }
    },
    [placesLib, goToPrediction]
  );

  // Debounced type-ahead. Skip the fetch right after a selection so the dropdown
  // doesn't immediately re-open with the chosen address.
  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    // runAutocomplete clears the list itself for empty input — keep setState out
    // of the effect body so it never fires a synchronous cascading render.
    const timer = setTimeout(() => void runAutocomplete(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runAutocomplete]);

  // User picked a suggestion: resolve its exact coordinate + formatted address.
  async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
    const place = prediction.toPlace();
    try {
      await place.fetchFields({ fields: ["location", "formattedAddress", "addressComponents"] });
    } catch {
      /* ignore — fall back to prediction text below */
    }
    const loc = place.location;
    const text = place.formattedAddress ?? prediction.text.text;
    justSelectedRef.current = true;
    setAddress(text);
    setQuery(text);
    setDistrict(districtFromPlace(place.addressComponents));
    setSuggestions([]);
    lastPreviewedIdRef.current = prediction.placeId; // already centred — skip re-preview
    sessionTokenRef.current = null; // a selection ends the autocomplete session
    if (loc) {
      const next = { lat: loc.lat(), lng: loc.lng() };
      setCoords(next);
      map?.panTo(next);
      map?.setZoom(18);
    }
  }

  // Drag the pin to fine-tune the exact spot, then refresh the address text.
  function handleDragEnd(e: google.maps.MapMouseEvent) {
    const lat = e.latLng?.lat();
    const lng = e.latLng?.lng();
    if (lat == null || lng == null) return;
    setCoords({ lat, lng });
    void reverseGeocode(lat, lng);
  }

  // GPS — for technicians standing at the customer's premise.
  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported on this device.");
      return;
    }
    setGeoLoading(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        map?.panTo({ lat, lng });
        map?.setZoom(18);
        void reverseGeocode(lat, lng);
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(err.message || "Couldn't get your current location.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  return (
    <>
      <div className="px-6 py-5 space-y-3">
        {authFailed && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Google Maps failed to load ({status}). Check that the API key is correct, that Maps JavaScript API +
              Places API are enabled, and that this site is allowed by the key&apos;s HTTP-referrer restriction.
            </span>
          </div>
        )}

        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search address, building or area..."
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searching && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={geoLoading}
              title="Use current location"
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-xs font-medium transition whitespace-nowrap"
            >
              {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
              <span className="hidden sm:inline">Pin lokasi semasa</span>
            </button>
          </div>

          {searchError && (
            <div className="absolute z-30 mt-1 w-full text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
              {searchError}
            </div>
          )}

          {suggestions.length > 0 && (
            <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {suggestions.map((p) => (
                <li key={p.placeId}>
                  <button
                    type="button"
                    onClick={() => void selectPrediction(p)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition"
                  >
                    <Search className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                    <span className="text-gray-700">{p.text.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="w-full h-56 md:h-104 rounded-xl overflow-hidden border border-gray-200">
          <Map
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
            mapId={MAP_ID}
            gestureHandling="greedy"
            disableDefaultUI
            clickableIcons={false}
            style={{ width: "100%", height: "100%" }}
            onClick={(e) => {
              const ll = e.detail.latLng;
              if (!ll) return;
              setCoords(ll);
              map?.panTo(ll);
              void reverseGeocode(ll.lat, ll.lng);
            }}
          >
            {coords && (
              <AdvancedMarker position={coords} draggable onDragEnd={handleDragEnd}>
                <Pin background="#dc2626" borderColor="#991b1b" glyphColor="#ffffff" />
              </AdvancedMarker>
            )}
          </Map>
        </div>

        <p className="text-xs text-gray-400">
          Search and pick an address, tap the map, or use your current location — then{" "}
          <span className="font-medium text-gray-600">drag the red pin</span> to the exact spot.
        </p>

        {geoError && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">{geoError}</p>
        )}

        {address && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 line-clamp-2">
            {address}
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
          onClick={() => {
            onAdd(address || query, coords?.lat ?? null, coords?.lng ?? null, district);
            onClose();
          }}
          disabled={!coords && !query.trim()}
          className="flex-1 py-2.5 rounded-lg bg-[#151513] hover:bg-[#26251f] disabled:bg-[#151513]/50 text-white text-sm font-medium transition"
        >
          Add
        </button>
      </div>
    </>
  );
}
