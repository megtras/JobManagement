import { getCloudflareContext } from "@opennextjs/cloudflare";

export type UploadSection = "photos" | "reports";

function uploadsBucket() {
  return getCloudflareContext().env.UPLOADS;
}

export function uploadObjectKey(section: UploadSection, filename: string) {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    throw new Error("Invalid upload filename");
  }
  return `${section}/${filename}`;
}

export function uploadKeyFromUrl(url: string) {
  const pathname = new URL(url, "http://local").pathname;
  const match = pathname.match(/^\/api\/uploads\/(photos|reports)\/([^/]+)$/);
  return match ? uploadObjectKey(match[1] as UploadSection, decodeURIComponent(match[2])) : null;
}

export async function putUpload(
  section: UploadSection,
  filename: string,
  value: ArrayBuffer | ArrayBufferView,
  contentType: string,
) {
  await uploadsBucket().put(uploadObjectKey(section, filename), value, {
    httpMetadata: { contentType },
  });
}

export async function getUploadByUrl(url: string) {
  const key = uploadKeyFromUrl(url);
  return key ? uploadsBucket().get(key) : null;
}

export async function getUpload(section: UploadSection, filename: string) {
  return uploadsBucket().get(uploadObjectKey(section, filename));
}

export async function deleteUploadByUrl(url: string) {
  const key = uploadKeyFromUrl(url);
  if (key) await uploadsBucket().delete(key);
}

export async function uploadBytesByUrl(url: string) {
  const object = await getUploadByUrl(url);
  return object ? new Uint8Array(await object.arrayBuffer()) : null;
}
