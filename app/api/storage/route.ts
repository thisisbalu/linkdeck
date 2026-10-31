import { NextResponse } from "next/server";
import { storageStatus } from "@/lib/storage";

/** GET /api/storage → where data lives, whether it's reachable, conflict copies, and suggested cloud folders. */
export async function GET() {
  return NextResponse.json(storageStatus(), { headers: { "Cache-Control": "no-store" } });
}
