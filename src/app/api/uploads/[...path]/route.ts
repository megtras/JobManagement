import { NextResponse } from "next/server";
import { getUpload, type UploadSection } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function resolveUpload(parts: string[]) {
  if (
    parts.length !== 2 ||
    !["photos", "reports"].includes(parts[0]) ||
    parts.some((part) => !part || part.includes("..") || part.includes("/") || part.includes("\\"))
  ) {
    return null;
  }

  return { section: parts[0] as UploadSection, filename: parts[1] };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const upload = resolveUpload(parts ?? []);
  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const object = await getUpload(upload.section, upload.filename);
    if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const ext = upload.filename.slice(upload.filename.lastIndexOf(".")).toLowerCase();

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${upload.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
