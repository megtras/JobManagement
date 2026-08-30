import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function resolveUploadPath(parts: string[]) {
  if (
    parts.length !== 2 ||
    !["photos", "reports"].includes(parts[0]) ||
    parts.some((part) => !part || part.includes("..") || part.includes("/") || part.includes("\\"))
  ) {
    return null;
  }

  return path.join(process.cwd(), process.env.UPLOAD_DIR ?? "./public/uploads", parts[0], parts[1]);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const filePath = resolveUploadPath(parts ?? []);
  if (!filePath) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
