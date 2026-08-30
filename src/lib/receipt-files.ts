export function isPdfReceiptUrl(url?: string | null) {
  if (!url) return false;
  const withoutQuery = url.split(/[?#]/, 1)[0] ?? "";
  return withoutQuery.toLowerCase().endsWith(".pdf");
}
