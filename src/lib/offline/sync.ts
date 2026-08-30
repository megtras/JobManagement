import {
  getPendingQueue,
  removeFromQueue,
  updateQueueItem,
  type OfflineRequestBody,
  type QueueItem,
} from "@/lib/offline/idb";

export const OFFLINE_SYNC_TAG = "genplus-task-sync";

export interface OfflineSyncResult {
  completed: number;
  pending: number;
  failed: number;
  completedTaskIds: string[];
  stoppedByNetwork: boolean;
  authRequired: boolean;
}

function requestBody(body: OfflineRequestBody): BodyInit | undefined {
  if (body.kind === "none") return undefined;
  if (body.kind === "json") return body.value;

  const form = new FormData();
  for (const entry of body.entries) {
    if (typeof entry.value === "string") {
      form.append(entry.name, entry.value);
    } else {
      form.append(entry.name, entry.value, entry.filename);
    }
  }
  return form;
}

function requestHeaders(item: QueueItem) {
  const headers = new Headers({
    "X-Offline-Action-ID": item.id,
    "X-Offline-Captured-At": new Date(item.createdAt).toISOString(),
  });
  if (item.body.kind === "json") headers.set("Content-Type", "application/json");
  return headers;
}

export async function executeQueueItem(item: QueueItem) {
  return fetch(item.url, {
    method: item.method,
    headers: requestHeaders(item),
    body: requestBody(item.body),
    credentials: "same-origin",
    cache: "no-store",
  });
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function responseError(response: Response) {
  try {
    const body = (await response.clone().json()) as { error?: string };
    return body.error || `Server returned HTTP ${response.status}`;
  } catch {
    return `Server returned HTTP ${response.status}`;
  }
}

export async function replayOfflineQueue(): Promise<OfflineSyncResult> {
  const queue = await getPendingQueue();
  const blockedTasks = new Set<string>();
  const completedTaskIds = new Set<string>();
  let completed = 0;
  let stoppedByNetwork = false;
  let authRequired = false;

  for (const item of queue) {
    if (item.failedAt || blockedTasks.has(item.taskId)) continue;

    try {
      await updateQueueItem(item.id, {
        attempts: item.attempts + 1,
        lastError: undefined,
      });
      const response = await executeQueueItem(item);

      if (response.ok) {
        await removeFromQueue(item.id);
        completed += 1;
        completedTaskIds.add(item.taskId);
        continue;
      }

      const message = await responseError(response);
      if (response.status === 401 || response.status === 403) {
        authRequired = true;
        await updateQueueItem(item.id, { lastError: "Sign in again before syncing." });
        break;
      }

      if (retryableStatus(response.status)) {
        await updateQueueItem(item.id, { lastError: message });
        stoppedByNetwork = true;
        break;
      }

      await updateQueueItem(item.id, { lastError: message, failedAt: Date.now() });
      blockedTasks.add(item.taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network unavailable";
      await updateQueueItem(item.id, { lastError: message });
      stoppedByNetwork = true;
      break;
    }
  }

  const remaining = await getPendingQueue();
  return {
    completed,
    pending: remaining.filter((item) => !item.failedAt).length,
    failed: remaining.filter((item) => !!item.failedAt).length,
    completedTaskIds: [...completedTaskIds],
    stoppedByNetwork,
    authRequired,
  };
}
