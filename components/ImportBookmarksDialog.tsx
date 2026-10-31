"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileX, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Bookmark } from "@/lib/types";

interface ImportBookmarksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (bookmarks: Bookmark[]) => void;
}

type Step = "upload" | "preview" | "importing" | "done" | "error";

interface ParsedLink {
  url: string;
  title: string;
}

/**
 * Parses a Netscape Bookmark File (HTML format exported by Chrome, Firefox, Safari, Edge).
 * Extracts all <A HREF="...">title</A> entries.
 */
/** Derives a clean readable title from a URL when the export didn't include one. */
function titleFromUrl(url: string): string {
  try {
    const p = new URL(url);
    // Use file= query param (SharePoint/OneDrive)
    const fileParam = p.searchParams.get("file");
    if (fileParam) {
      return fileParam
        .replace(/\.[^.]+$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_+]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }
    // Use last meaningful path segment
    const segments = p.pathname.split("/").filter((s) =>
      s && !/^\d+$/.test(s) && !s.includes(".") && s.length > 2
    );
    const last = segments[segments.length - 1];
    if (last) {
      return last
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return p.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseBookmarkHtml(html: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  // Match all anchor tags — the Netscape format is simple flat HTML
  const regex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const url = decodeEntities(match[1].trim());
    const rawTitle = decodeEntities(match[2].trim());
    // Skip non-http links (javascript:, place:, etc.)
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    // If title is empty OR looks like a URL itself, derive from URL path
    const titleIsUrl = !rawTitle || rawTitle.startsWith("http://") || rawTitle.startsWith("https://");
    const title = titleIsUrl ? titleFromUrl(url) : rawTitle;
    links.push({ url, title });
  }
  return links;
}

export function ImportBookmarksDialog({
  open,
  onOpenChange,
  onImported,
}: ImportBookmarksDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedLink[]>([]);
  const [importing, setImporting] = useState(0);
  const [total, setTotal] = useState(0);
  const [imported, setImported] = useState<Bookmark[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setFile(null);
    setParsed([]);
    setImporting(0);
    setTotal(0);
    setImported([]);
    setDuplicateCount(0);
    setErrorMsg("");
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function handleFile(f: File) {
    setFile(f);
    const text = await f.text();
    const links = parseBookmarkHtml(text);
    if (links.length === 0) {
      setErrorMsg("No bookmarks found. Make sure this is a browser bookmark export (HTML format).");
      setStep("error");
      return;
    }
    setParsed(links);
    setStep("preview");
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startImport() {
    setStep("importing");
    setTotal(parsed.length);
    setImporting(0);
    const results: Bookmark[] = [];
    let duplicates = 0;

    // Import in batches of 5 to avoid overwhelming the server
    const BATCH = 5;
    for (let i = 0; i < parsed.length; i += BATCH) {
      const batch = parsed.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async ({ url, title }) => {
          try {
            const res = await fetch("/api/bookmarks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, title }),
            });
            if (res.ok) {
              const bm: Bookmark = await res.json();
              results.push(bm);
            } else if (res.status === 409) {
              duplicates++;
            }
          } catch {
            // Skip failed URLs silently
          } finally {
            setImporting((n) => n + 1);
          }
        })
      );
    }

    setImported(results);
    setDuplicateCount(duplicates);
    onImported(results);
    setStep("done");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-zinc-900 border-zinc-800 text-zinc-100 flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-zinc-100 text-base font-semibold">
            Import Bookmarks
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0">

        {/* ── Upload step ── */}
        {step === "upload" && (
          <div className="flex flex-col gap-4 mt-1">
            <p className="text-xs text-zinc-500 leading-relaxed">
              Export your bookmarks from Chrome <span className="text-zinc-400">(Bookmarks Manager → ⋮ → Export)</span>,
              Firefox <span className="text-zinc-400">(Bookmarks → Manage → Import and Backup → Export)</span>,
              or Safari <span className="text-zinc-400">(File → Export Bookmarks)</span> — then drop the HTML file here.
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors ${
                dragging
                  ? "border-zinc-400 bg-zinc-800"
                  : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".html,.htm"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Upload size={32} className="text-zinc-500" />
              <div className="text-center">
                <p className="text-sm text-zinc-300">
                  Drop bookmark HTML file or{" "}
                  <span className="text-zinc-100 underline">click to browse</span>
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Chrome / Firefox / Safari / Edge export format
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview step ── */}
        {step === "preview" && (
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              Found <strong className="text-zinc-100">{parsed.length}</strong> bookmarks in{" "}
              <span className="text-zinc-400 truncate max-w-[180px]">{file?.name}</span>
            </div>

            {/* Scrollable preview list — all entries */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 divide-y divide-zinc-800 overflow-y-auto" style={{ maxHeight: "340px" }}>
              {parsed.map((link, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${new URL(link.url).hostname}&sz=16`}
                    alt=""
                    width={14}
                    height={14}
                    className="rounded-sm shrink-0 opacity-70"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="text-xs text-zinc-300 truncate flex-1">{link.title}</span>
                  <span className="text-[10px] text-zinc-600 shrink-0 ml-2">
                    {new URL(link.url).hostname.replace("www.", "")}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs text-zinc-500 shrink-0">
              Each bookmark will be enriched with category and tags. Duplicates (same URL) are skipped automatically.
            </p>

            <div className="flex justify-end gap-2 shrink-0 pt-1">
              <Button type="button" variant="ghost" onClick={reset} className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
                Back
              </Button>
              <Button type="button" onClick={startImport} className="bg-zinc-100 text-zinc-900 hover:bg-white">
                Import {parsed.length} bookmarks
              </Button>
            </div>
          </div>
        )}

        {/* ── Importing step ── */}
        {step === "importing" && (
          <div className="flex flex-col gap-5 mt-2 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-zinc-300 font-medium">
                  Importing… {importing} / {total}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Enriching with categories and tags</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-zinc-300 rounded-full transition-all duration-300"
                style={{ width: total ? `${(importing / total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        )}

        {/* ── Done step ── */}
        {step === "done" && (
          <div className="flex flex-col gap-4 mt-1">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-300">
                  Import complete
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  <strong className="text-zinc-200">{imported.length}</strong> bookmarks added
                  {duplicateCount > 0 && (
                    <span className="text-zinc-500">
                      {" "}· {duplicateCount} already saved
                    </span>
                  )}
                  {parsed.length - imported.length - duplicateCount > 0 && (
                    <span className="text-zinc-500">
                      {" "}· {parsed.length - imported.length - duplicateCount} skipped (invalid or failed)
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => handleClose(false)} className="bg-zinc-100 text-zinc-900 hover:bg-white">
                Done
              </Button>
            </div>
          </div>
        )}

        {/* ── Error step ── */}
        {step === "error" && (
          <div className="flex flex-col gap-4 mt-1">
            <div className="flex items-start gap-2.5 rounded-lg bg-red-950/40 border border-red-900/50 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={reset} className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
                Try again
              </Button>
              <Button type="button" variant="ghost" onClick={() => handleClose(false)} className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
                Close
              </Button>
            </div>
          </div>
        )}
        </div>{/* end scrollable wrapper */}
      </DialogContent>
    </Dialog>
  );
}
