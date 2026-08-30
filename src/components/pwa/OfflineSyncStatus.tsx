"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import {
  queueSummary,
  retryFailedQueueItems,
} from "@/lib/offline/idb";
import {
  dispatchSyncCompleted,
  OFFLINE_QUEUE_CHANGED_EVENT,
} from "@/lib/offline/client";
import { replayOfflineQueue } from "@/lib/offline/sync";

const FOREGROUND_SYNC_INTERVAL_MS = 30_000;

type Summary = Awaited<ReturnType<typeof queueSummary>>;

export function OfflineSyncStatus({ enabled }: { enabled: boolean }) {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [summary, setSummary] = useState<Summary>({
    pending: 0,
    failed: 0,
    total: 0,
    firstFailedLabel: "",
    firstFailedError: "",
  });
  const [syncing, setSyncing] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const syncingRef = useRef(false);

  const refreshSummary = useCallback(async () => {
    setSummary(await queueSummary());
  }, []);

  const syncNow = useCallback(async () => {
    if (!enabled || syncingRef.current || typeof navigator === "undefined" || !navigator.onLine) {
      await refreshSummary();
      return;
    }

    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await replayOfflineQueue();
      setAuthRequired(result.authRequired);
      if (result.completedTaskIds.length > 0) {
        dispatchSyncCompleted(result.completedTaskIds);
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshSummary();
    }
  }, [enabled, refreshSummary]);

  const retryFailed = useCallback(async () => {
    await retryFailedQueueItems();
    await refreshSummary();
    await syncNow();
  }, [refreshSummary, syncNow]);

  /* eslint-disable react-hooks/set-state-in-effect -- queue state is read asynchronously from IndexedDB after mount */
  useEffect(() => {
    if (!enabled) return;

    const updateNetwork = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (nextOnline) void syncNow();
      else void refreshSummary();
    };
    const queueChanged = () => {
      void refreshSummary();
      if (navigator.onLine) void syncNow();
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void syncNow();
    };
    const serviceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== "GENPLUS_OFFLINE_SYNC_COMPLETE") return;
      const taskIds = Array.isArray(event.data.taskIds) ? event.data.taskIds : [];
      dispatchSyncCompleted(taskIds);
      void refreshSummary();
    };

    void refreshSummary();
    if (navigator.onLine) void syncNow();

    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") void syncNow();
    }, FOREGROUND_SYNC_INTERVAL_MS);

    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, queueChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    navigator.serviceWorker?.addEventListener("message", serviceWorkerMessage);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, queueChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
      navigator.serviceWorker?.removeEventListener("message", serviceWorkerMessage);
    };
  }, [enabled, refreshSummary, syncNow]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!enabled || (online && summary.total === 0 && !authRequired)) return null;

  if (!online) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <CloudOff className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">Offline mode</p>
          <p className="text-xs text-amber-700">
            Changes are saved on this device{summary.total ? ` · ${summary.total} waiting to sync` : ""}.
          </p>
        </div>
      </div>
    );
  }

  if (summary.failed > 0 || authRequired) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Some offline changes need attention</p>
          <p className="text-xs text-red-700">
            {authRequired
              ? "Please sign in again, then retry sync."
              : `${summary.firstFailedLabel || "Update"}: ${summary.firstFailedError || "Rejected by the server."}`}
          </p>
        </div>
        {!authRequired && (
          <button type="button" onClick={retryFailed} className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {syncing ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Cloud className="h-5 w-5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{syncing ? "Syncing offline changes…" : "Waiting to sync"}</p>
        <p className="text-xs text-blue-700">{summary.pending} update(s) saved safely on this device.</p>
      </div>
      {!syncing && (
        <button type="button" onClick={syncNow} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">
          <RefreshCw className="h-3.5 w-3.5" /> Sync now
        </button>
      )}
    </div>
  );
}
