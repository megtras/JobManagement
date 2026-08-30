const LEGACY_UPLOAD_PREFIX = "/uploads/";
const API_UPLOAD_PREFIX = "/api/uploads/";

export function uploadPublicUrl(section: "photos" | "reports", filename: string) {
  return `${API_UPLOAD_PREFIX}${section}/${filename}`;
}

export function normalizeUploadUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith(API_UPLOAD_PREFIX)) return url;

  try {
    const parsed = new URL(url, "http://local");
    const pathname = parsed.pathname.replaceAll("\\", "/");
    if (!pathname.startsWith(LEGACY_UPLOAD_PREFIX)) return url;

    const normalizedPath = `/api${pathname}`;
    return url.startsWith("http") ? `${parsed.origin}${normalizedPath}` : normalizedPath;
  } catch {
    return url;
  }
}
