const MAX_OFFLINE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function capturedDate(value: unknown, fallback = new Date()) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  if (!Number.isFinite(timestamp)) return fallback;

  const now = Date.now();
  if (timestamp < now - MAX_OFFLINE_AGE_MS || timestamp > now + MAX_FUTURE_SKEW_MS) {
    return fallback;
  }
  return parsed;
}

export function clientGeneratedId(value: unknown, prefix: string) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(`${prefix}-`) || !/^[A-Za-z0-9_-]{12,160}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}
