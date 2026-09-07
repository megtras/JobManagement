import { normalizeUploadUrl } from "@/lib/upload-urls";

const DEFAULT_PUBLIC_APP_URL = "http://localhost:3100";

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function isLocalHost(hostname: string) {
  const cleanHost = hostname.split(":")[0]?.toLowerCase() ?? "";
  return cleanHost === "localhost" || cleanHost === "127.0.0.1" || cleanHost === "::1";
}

function isLocalAppUrl(url: string) {
  try {
    return isLocalHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function publicAppUrl(request?: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl && !isLocalAppUrl(configuredUrl)) {
    return trimTrailingSlash(configuredUrl);
  }

  const forwardedHost = request?.headers.get("x-forwarded-host");
  const requestHost = forwardedHost ?? request?.headers.get("host") ?? "";
  if (requestHost && !isLocalHost(requestHost)) {
    const protocol = request?.headers.get("x-forwarded-proto") ?? "https";
    return trimTrailingSlash(`${protocol}://${requestHost}`);
  }

  return DEFAULT_PUBLIC_APP_URL;
}

export function publicReportUrl(pdfUrl: string, request?: Request) {
  const normalizedUrl = normalizeUploadUrl(pdfUrl);
  if (!normalizedUrl) return "";

  try {
    const parsed = new URL(normalizedUrl);
    if (!isLocalHost(parsed.hostname)) return parsed.toString();
    return `${publicAppUrl(request)}${parsed.pathname}${parsed.search}`;
  } catch {
    const path = normalizedUrl.startsWith("/") ? normalizedUrl : `/${normalizedUrl}`;
    return `${publicAppUrl(request)}${path}`;
  }
}

export function whatsappReportLink(phone: string | null | undefined, pdfUrl: string, request?: Request) {
  // External messaging is disabled by default in the isolated demo.
  if (process.env.ENABLE_EXTERNAL_WHATSAPP !== "true") return "";
  if (!phone) return "";
  const digits = phone.replace(/^0/, "").replace(/\D/g, "");
  if (!digits) return "";
  const reportUrl = publicReportUrl(pdfUrl, request);
  return `https://wa.me/60${digits}?text=${encodeURIComponent(`Service report from Megtras: ${reportUrl}`)}`;
}
