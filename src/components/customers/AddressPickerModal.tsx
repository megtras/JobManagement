"use client";

import { useState } from "react";
import { AddressPickerLeaflet } from "./AddressPickerLeaflet";
import { AddressPickerGoogle } from "./AddressPickerGoogle";

interface Props {
  onAdd: (address: string, lat: number | null, lng: number | null, district?: string) => void;
  onClose: () => void;
}

// Provider switch. Leaflet stays the default so nothing breaks if Google isn't
// set up. Opt into Google explicitly with NEXT_PUBLIC_MAPS_PROVIDER=google (plus
// the two NEXT_PUBLIC_GOOGLE_MAPS_* keys). To fall back, drop that one env line
// and rebuild — no code change. NEXT_PUBLIC_* values are inlined at build time.
const USE_GOOGLE =
  process.env.NEXT_PUBLIC_MAPS_PROVIDER === "google" &&
  !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY &&
  !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

export function AddressPickerModal(props: Props) {
  const [provider, setProvider] = useState<"google" | "leaflet">(USE_GOOGLE ? "google" : "leaflet");

  return provider === "google"
    ? <AddressPickerGoogle {...props} onFallbackToLeaflet={() => setProvider("leaflet")} />
    : <AddressPickerLeaflet {...props} />;
}
