import { NextResponse } from "next/server";
import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { requestLimiter } from "@/lib/requestSecurity";

const limit = requestLimiter(60, 1);
const mediaTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

export async function GET(request: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const limited = limit(request.headers);
  if (limited) return limited;
  const input = z
    .string()
    .min(1)
    .max(2048)
    .safeParse(new URL(request.url).searchParams.get("path"));
  if (!input.success || input.data.includes("\0")) {
    return new NextResponse("Invalid path", { status: 400 });
  }
  const downloadsDir = path.resolve(process.cwd(), "x_downloads");
  const requested = path.resolve(process.cwd(), input.data);
  // A path separator is essential: x_downloads-private is not x_downloads.
  if (!requested.startsWith(downloadsDir + path.sep)) {
    return new NextResponse("Access denied", { status: 403 });
  }
  try {
    const root = await realpath(downloadsDir);
    const resolved = await realpath(requested);
    if (!resolved.startsWith(root + path.sep)) {
      return new NextResponse("Access denied", { status: 403 });
    }
    const contentType = mediaTypes[path.extname(resolved).toLowerCase()];
    if (!contentType)
      return new NextResponse("Unsupported media", { status: 415 });
    const file = await open(
      resolved,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const stat = await file.stat();
    if (!stat.isFile()) {
      await file.close();
      return new NextResponse("Not found", { status: 404 });
    }
    const stream = Readable.toWeb(
      file.createReadStream(),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
