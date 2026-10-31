import { NextRequest, NextResponse } from "next/server";
import { readBookmarks } from "@/lib/bookmarks";
import { checkUrl, mapConcurrent } from "@/lib/link-check";
import { saveLinkStatuses, type LinkStatusMap } from "@/lib/link-status";
import { parseLinkCheckBody } from "@/lib/bookmark-input";
import { withStorageErrors } from "@/lib/api-errors";

const CONCURRENCY = 6;

/**
 * POST /api/links/check   Body: {} or { ids: [...] }
 * Streams newline-delimited JSON:
 *   { "type": "start", "total": n }
 *   { "type": "result", "id", "url", "state", "code", "detail", "checkedAt" }   (one per bookmark, as they finish)
 *   { "type": "done", "checked": n }
 * Results are saved even if the client disconnects part-way.
 */
async function handlePOST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const parsed = parseLinkCheckBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const all = await readBookmarks();
  const wanted = parsed.value.ids ? new Set(parsed.value.ids) : null;
  const targets = wanted ? all.filter((b) => wanted.has(b.id)) : all;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch { /* client gone */ }
      };
      const results: LinkStatusMap = {};
      send({ type: "start", total: targets.length });
      try {
        for await (const { id, status } of mapConcurrent(targets, CONCURRENCY, async (b) => ({ id: b.id, status: await checkUrl(b.url) }))) {
          results[id] = status;
          if (!request.signal.aborted) send({ type: "result", id, ...status });
        }
      } finally {
        await saveLinkStatuses(results, await readBookmarks());
        send({ type: "done", checked: Object.keys(results).length });
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const POST = withStorageErrors(handlePOST);
