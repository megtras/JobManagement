import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, NetworkOnly } from "serwist";
import { replayOfflineQueue, OFFLINE_SYNC_TAG } from "@/lib/offline/sync";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

interface BackgroundSyncEvent {
  tag: string;
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerClient {
  postMessage(message: unknown): void;
}

declare const self: ServiceWorkerGlobalScope & {
  addEventListener(type: "sync", listener: (event: BackgroundSyncEvent) => void): void;
  clients: {
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<WorkerClient[]>;
  };
};

function filterPrecacheUploads(entries: (PrecacheEntry | string)[] | undefined) {
  return (entries ?? []).filter((entry) => {
    const url = typeof entry === "string" ? entry : entry.url;
    const normalized = url.replaceAll("\\", "/");
    return !normalized.includes("/uploads/");
  });
}

const serwist = new Serwist({
  precacheEntries: (() => {
    const entries = filterPrecacheUploads(self.__SW_MANIFEST);
    const hasOfflineFallback = entries.some((entry) =>
      (typeof entry === "string" ? entry : entry.url).includes("/app-offline.html")
    );
    return hasOfflineFallback
      ? entries
      : [...entries, { url: "/app-offline.html", revision: "2026-08-21-1" }];
  })(),
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Technician task detail has an IndexedDB fallback, while staff appointment
    // detail should fail clearly instead of showing an older completed report.
    // Keep both live detail requests out of Serwist's generic API cache.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && (
          /^\/api\/tasks\/[^/]+$/.test(url.pathname)
          || /^\/api\/appointments\/[^/]+$/.test(url.pathname)
        ),
      method: "GET",
      handler: new NetworkOnly(),
    },
    // Uploaded files (receipts, evidence/attendance photos) — always try the
    // network first so a stale/poisoned entry is never served; cache as offline
    // fallback. Must come before defaultCache's broad image rule.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && (url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/api/uploads/")),
      handler: new NetworkFirst({ cacheName: "uploads", networkTimeoutSeconds: 10 }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/app-offline.html",
        matcher: ({ request }) => request.mode === "navigate" || request.destination === "document",
      },
    ],
  },
});

self.addEventListener("sync", (event) => {
  if (event.tag !== OFFLINE_SYNC_TAG) return;
  event.waitUntil((async () => {
    const result = await replayOfflineQueue();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: "GENPLUS_OFFLINE_SYNC_COMPLETE",
        taskIds: result.completedTaskIds,
      });
    }
  })());
});

serwist.addEventListeners();
