"use client";

import { useEffect } from "react";

/**
 * The service worker is intentionally disabled in development (see next.config.ts —
 * Serwist only runs in production builds). A leftover SW from a production visit can
 * keep intercepting requests and serve stale/poisoned cached responses (e.g. broken
 * `/uploads` images). This unregisters any such worker and clears its caches in dev.
 */
export function DevSwCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    void (async () => {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
      if (regs.length === 0) return; // nothing stale — no reload needed
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      if (typeof caches !== "undefined") {
        const keys = await caches.keys().catch(() => []);
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      }
      // Reload once so the page is no longer controlled by the removed worker
      // (cached/poisoned responses like broken /uploads images then refetch).
      if (navigator.serviceWorker.controller) window.location.reload();
    })();
  }, []);
  return null;
}
