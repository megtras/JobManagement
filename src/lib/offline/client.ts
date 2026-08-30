import {
  getPendingQueueForTask,
  putQueueItem,
  type OfflineActionType,
  type OfflineFormEntry,
  type OfflineRequestBody,
  type QueueItem,
} from "@/lib/offline/idb";
import { executeQueueItem, OFFLINE_SYNC_TAG } from "@/lib/offline/sync";

export const OFFLINE_QUEUE_CHANGED_EVENT = "genplus-offline-queue-changed";
export const OFFLINE_SYNC_COMPLETED_EVENT = "genplus-offline-sync-completed";

export interface OfflineRequestOptions {
  taskId: string;
  action: OfflineActionType;
  label: string;
  entityId?: string;
  coalesceKey?: string;
  url: string;
  method?: string;
  json?: unknown;
  formData?: FormData;
  actionId?: string;
}

export type OfflineRequestResult =
  | { queued: true; item: QueueItem }
  | { queued: false; item: QueueItem; response: Response };

function createActionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function serializeFormData(formData: FormData): OfflineFormEntry[] {
  const entries: OfflineFormEntry[] = [];
  formData.forEach((value, name) => {
    if (typeof value === "string") {
      entries.push({ name, value });
    } else {
      entries.push({ name, value, filename: value.name });
    }
  });
  return entries;
}

function serializeBody(options: OfflineRequestOptions): OfflineRequestBody {
  if (options.formData) {
    return { kind: "form-data", entries: serializeFormData(options.formData) };
  }
  if (options.json !== undefined) {
    return { kind: "json", value: JSON.stringify(options.json) };
  }
  return { kind: "none" };
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_CHANGED_EVENT));
  }
}

function shouldRetryLater(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function registerBackgroundSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    };
    await syncRegistration.sync?.register(OFFLINE_SYNC_TAG);
  } catch {
    // Foreground sync remains the cross-browser fallback, especially on iOS.
  }
}

async function queueItem(item: QueueItem) {
  await putQueueItem(item);
  notifyQueueChanged();
  await registerBackgroundSync();
  return { queued: true, item } as const;
}

export async function submitOfflineRequest(
  options: OfflineRequestOptions
): Promise<OfflineRequestResult> {
  const item: QueueItem = {
    id: options.actionId ?? createActionId(),
    taskId: options.taskId,
    action: options.action,
    label: options.label,
    entityId: options.entityId,
    coalesceKey: options.coalesceKey,
    url: options.url,
    method: options.method ?? "POST",
    body: serializeBody(options),
    createdAt: Date.now(),
    attempts: 0,
  };

  // Once an earlier task action is queued, keep every later action behind it.
  // This prevents a recovered connection from submitting the report or
  // checkout before an earlier remark has reached the server.
  const earlierTaskActions = await getPendingQueueForTask(item.taskId);
  if (earlierTaskActions.length > 0) {
    return queueItem(item);
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return queueItem(item);
  }

  try {
    const response = await executeQueueItem(item);
    if (shouldRetryLater(response.status)) {
      return queueItem(item);
    }
    return { queued: false, item, response };
  } catch {
    return queueItem(item);
  }
}

export function offlineEntityId(prefix: string) {
  return `${prefix}-${createActionId()}`;
}

export function dispatchSyncCompleted(taskIds: string[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OFFLINE_SYNC_COMPLETED_EVENT, { detail: { taskIds } })
  );
}
