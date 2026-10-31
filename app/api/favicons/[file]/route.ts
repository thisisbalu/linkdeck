import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { findFavicon, isFaviconFileName } from "@/lib/favicon";

type RouteParams = { params: Promise<{ file: string }> };

/**
 * GET /api/favicons/<host>.png
 *
 * Favicons are cached in the data folder (which may be a synced cloud folder),
 * not in public/, so next.config.ts rewrites /favicons/* here.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { file } = await params;
  if (!isFaviconFileName(file)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const found = findFavicon(file);
    if (!found) throw new Error("missing");
    const data = await fs.promises.readFile(found);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
