import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type OfflineActionType =
  | "start"
  | "checkin"
  | "checkin-sos"
  | "photo-create"
  | "photo-update"
  | "photo-delete"
  | "remark"
  | "work-item"
  | "payment"
  | "urgent"
  | "report"
  | "checkout";

export type OfflineRequestBody =
  | { kind: "none" }
  | { kind: "json"; value: string }
  | { kind: "form-data"; entries: OfflineFormEntry[] };

export interface OfflineFormEntry {
  name: string;
  value: string | Blob;
  filename?: string;
}

export interface QueueItem {
  id: string;
  taskId: string;
  action: OfflineActionType;
  label: string;
  entityId?: string;
  coalesceKey?: string;
  url: string;
  method: string;
  body: OfflineRequestBody;
  createdAt: number;
  attempts: number;
  lastError?: string;
  failedAt?: number;
}

interface LegacyQueueItem {
  id: string;
  url: string;
  method: string;
  body: string;
  contentType: string;
  createdAt: number;
}

interface CachedTask {
  id: string;
  data: unknown;
  cachedAt: number;
}

interface CachedTaskList {
  id: string;
  data: unknown;
  cachedAt: number;
}

interface OfflineMeta {
  key: string;
  value: unknown;
}

interface OfflineDB extends DBSchema {
  queue: {
    key: string;
    value: QueueItem | LegacyQueueItem;
    indexes: { createdAt: number };
  };
  tasks: { key: string; value: CachedTask };
  taskLists: { key: string; value: CachedTaskList };
  meta: { key: string; value: OfflineMeta };
}

const DB_NAME = "genplusaircond-offline";
const DB_VERSION = 2;
const ACTIVE_TASK_LIST_KEY = "assigned-tasks";

let database: IDBPDatabase<OfflineDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (database) return database;

  database = await openDB<OfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const queue = db.createObjectStore("queue", { keyPath: "id" });
        queue.createIndex("createdAt", "createdAt");
        db.createObjectStore("tasks", { keyPath: "id" });
      }
      if (oldVersion < 2) {
        db.createObjectStore("taskLists", { keyPath: "id" });
        db.createObjectStore("meta", { keyPath: "key" });
      }
    },
  });

  return database;
}

function taskIdFromUrl(url: string) {
  return url.match(/\/api\/tasks\/([^/]+)/)?.[1] ?? "unknown";
}

function normalizeQueueItem(item: QueueItem | LegacyQueueItem): QueueItem {
  if ("action" in item) return item;

  return {
    id: item.id,
    taskId: taskIdFromUrl(item.url),
    action: "checkin",
    label: "GPS check-in",
    url: item.url,
    method: item.method,
    body: item.contentType.includes("application/json")
      ? { kind: "json", value: item.body }
      : { kind: "none" },
    createdAt: item.createdAt,
    attempts: 0,
  };
}

export async function putQueueItem(item: QueueItem) {
  const db = await getDB();
  if (item.coalesceKey) {
    const existing = await getPendingQueue();
    await Promise.all(
      existing
        .filter((queued) => queued.coalesceKey === item.coalesceKey)
        .map((queued) => db.delete("queue", queued.id))
    );
  }
  await db.put("queue", item);
}

export async function getPendingQueue(): Promise<QueueItem[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex("queue", "createdAt");
  return items.map(normalizeQueueItem).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPendingQueueForTask(taskId: string) {
  const queue = await getPendingQueue();
  return queue.filter((item) => item.taskId === taskId);
}

export async function updateQueueItem(id: string, patch: Partial<QueueItem>) {
  const db = await getDB();
  const current = await db.get("queue", id);
  if (!current) return;
  await db.put("queue", { ...normalizeQueueItem(current), ...patch });
}

export async function removeFromQueue(id: string) {
  const db = await getDB();
  await db.delete("queue", id);
}

export async function removeQueuedEntity(taskId: string, entityId: string, action?: OfflineActionType) {
  const db = await getDB();
  const queue = await getPendingQueue();
  const matches = queue.filter((item) =>
    item.taskId === taskId && item.entityId === entityId && (!action || item.action === action)
  );
  await Promise.all(
    matches.map((item) => db.delete("queue", item.id))
  );
  return matches.length;
}

export async function retryFailedQueueItems() {
  const queue = await getPendingQueue();
  await Promise.all(
    queue
      .filter((item) => item.failedAt)
      .map((item) => updateQueueItem(item.id, { failedAt: undefined, lastError: undefined }))
  );
}

export async function cacheTask(id: string, data: unknown) {
  const db = await getDB();
  await db.put("tasks", { id, data, cachedAt: Date.now() });
}

export async function getCachedTask<T = unknown>(id: string): Promise<T | null> {
  const db = await getDB();
  const entry = await db.get("tasks", id);
  return (entry?.data as T | undefined) ?? null;
}

export async function cacheTaskList(data: unknown) {
  const db = await getDB();
  await db.put("taskLists", { id: ACTIVE_TASK_LIST_KEY, data, cachedAt: Date.now() });
}

export async function getCachedTaskList<T = unknown>(): Promise<T | null> {
  const db = await getDB();
  const entry = await db.get("taskLists", ACTIVE_TASK_LIST_KEY);
  return (entry?.data as T | undefined) ?? null;
}

export async function updateCachedTaskListItem(
  taskId: string,
  patch: Record<string, unknown>
) {
  const db = await getDB();
  const entry = await db.get("taskLists", ACTIVE_TASK_LIST_KEY);
  if (!entry || !Array.isArray(entry.data)) return;

  const data = entry.data.map((item) => {
    if (!item || typeof item !== "object" || !("id" in item) || item.id !== taskId) return item;
    return { ...item, ...patch };
  });
  await db.put("taskLists", { ...entry, data, cachedAt: Date.now() });
}

export async function setOfflineMeta(key: string, value: unknown) {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function getOfflineMeta<T = unknown>(key: string): Promise<T | null> {
  const db = await getDB();
  const entry = await db.get("meta", key);
  return (entry?.value as T | undefined) ?? null;
}

export async function clearOfflineData() {
  const db = await getDB();
  await Promise.all([
    db.clear("queue"),
    db.clear("tasks"),
    db.clear("taskLists"),
    db.clear("meta"),
  ]);
  if (typeof caches !== "undefined") {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
}

export async function queueSummary() {
  const queue = await getPendingQueue();
  const firstFailed = queue.find((item) => !!item.failedAt);
  return {
    pending: queue.filter((item) => !item.failedAt).length,
    failed: queue.filter((item) => !!item.failedAt).length,
    total: queue.length,
    firstFailedLabel: firstFailed?.label ?? "",
    firstFailedError: firstFailed?.lastError ?? "",
  };
}
