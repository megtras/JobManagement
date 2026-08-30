"use client";

import { useEffect, useRef } from "react";

const TRACKING_STORAGE_KEY = "genplus:last-location-posted-at";
const MIN_POST_INTERVAL_MS = 10 * 1000;
const MIN_MOVE_METERS = 15;
const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000,
};
const FALLBACK_LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 30000,
};

function distanceInMeters(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const fromLatRadians = toRadians(fromLat);
  const toLatRadians = toRadians(toLat);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(fromLatRadians) * Math.cos(toLatRadians) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function LocationTracker({ userId }: { userId?: string | null }) {
  const lastSentLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastPostAttemptAtRef = useRef(0);

  useEffect(() => {
    if (!userId) return;
    if (!("geolocation" in navigator)) return;

    const storageKey = `${TRACKING_STORAGE_KEY}:${userId}`;
    lastSentLocationRef.current = null;
    lastPostAttemptAtRef.current = 0;

    const postPosition = async (position: GeolocationPosition) => {
      const { latitude: lat, longitude: lng } = position.coords;
      const lastLocation = lastSentLocationRef.current;
      const now = Date.now();
      const movedEnough = !lastLocation
        || distanceInMeters(lastLocation.lat, lastLocation.lng, lat, lng) >= MIN_MOVE_METERS;
      if (!movedEnough || now - lastPostAttemptAtRef.current < MIN_POST_INTERVAL_MS) return;

      lastPostAttemptAtRef.current = now;

      try {
        const res = await fetch("/api/tracking/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
          cache: "no-store",
        });
        if (res.ok) {
          lastSentLocationRef.current = { lat, lng };
          window.localStorage.setItem(storageKey, String(now));
        }
      } catch {
        lastPostAttemptAtRef.current = 0;
        // Location tracking is best-effort; never block the app shell.
      }
    };

    const requestCurrentPosition = (options: PositionOptions) => {
      navigator.geolocation.getCurrentPosition(
        postPosition,
        () => {
          lastPostAttemptAtRef.current = 0;
          if (options.enableHighAccuracy) requestCurrentPosition(FALLBACK_LOCATION_OPTIONS);
        },
        options
      );
    };

    const postCurrentLocation = async () => {
      if ("permissions" in navigator && navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          if (permission.state === "denied") return;
        } catch {
          // Some Android browsers expose geolocation but not Permissions API.
        }
      }
      requestCurrentPosition(LOCATION_OPTIONS);
    };

    postCurrentLocation();
    const watchId = navigator.geolocation.watchPosition(
      postPosition,
      () => {
        lastPostAttemptAtRef.current = 0;
        requestCurrentPosition(FALLBACK_LOCATION_OPTIONS);
      },
      LOCATION_OPTIONS
    );

    const handleVisible = () => {
      if (document.visibilityState === "visible") postCurrentLocation();
    };
    window.addEventListener("focus", postCurrentLocation);
    document.addEventListener("visibilitychange", handleVisible);
    const interval = window.setInterval(postCurrentLocation, MIN_POST_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", postCurrentLocation);
      document.removeEventListener("visibilitychange", handleVisible);
      window.clearInterval(interval);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [userId]);

  return null;
}
