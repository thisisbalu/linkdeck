"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  BookmarkFormFields,
  diffFormValues,
  toFormValues,
  validateFormValues,
  type BookmarkFormValues,
} from "@/components/BookmarkFormFields";
import { RememberCategoryCheckbox, saveCategoryRule, shouldOfferRemember } from "@/components/RememberCategoryCheckbox";
import type { Bookmark } from "@/lib/types";

interface AddBookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (bookmark: Bookmark) => void;
  /** Existing categories for suggestions; loaded from the API when omitted. */
  categories?: string[];
}

function discardBookmark(id: string) {
  fetch(`/api/bookmarks/${id}`, { method: "DELETE" }).catch(() => {});
}

type Step = "input" | "loading" | "preview" | "error";

export function AddBookmarkDialog({
  open,
  onOpenChange,
  onAdded,
  categories: categoriesProp,
}: AddBookmarkDialogProps) {
  const [loadedCategories, setLoadedCategories] = useState<string[]>([]);
  const categories = categoriesProp ?? loadedCategories;
  const [step, setStep] = useState<Step>("input");
  const [url, setUrl] = useState("");
  const [bookmark, setBookmark] = useState<Bookmark | null>(null);
  const [values, setValues] = useState<BookmarkFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [remember, setRemember] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // The server saves the bookmark before the preview step. These refs let us
  // discard it if the user cancels (or closes the dialog mid-request).
  const openRef = useRef(open);
  const pendingIdRef = useRef<string | null>(null);

  // Reset and focus when dialog opens
  useEffect(() => {
    openRef.current = open;
    if (open) {
      setBookmark(null);
      setValues(null);
      setPreviewError("");
      setSaving(false);
      setRemember(true);
      setErrorMsg("");
      setStep("input");
      setUrl("");
      pendingIdRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
      if (!categoriesProp) {
        fetch("/api/bookmarks")
          .then((r) => r.json())
          .then((all: Bookmark[]) => setLoadedCategories(Array.from(new Set(all.map((b) => b.category))).sort()))
          .catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (!next && pendingIdRef.current) {
      discardBookmark(pendingIdRef.current);
      pendingIdRef.current = null;
    }
    onOpenChange(next);
  }

  async function submitUrl(finalUrl: string) {
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl }),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        const title = (data.bookmark as Bookmark | undefined)?.title;
        throw new Error(title ? `Already saved as "${title}".` : "This URL is already bookmarked.");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      const data: Bookmark = await res.json();
      if (!openRef.current) {
        discardBookmark(data.id);
        return;
      }
      pendingIdRef.current = data.id;
      setBookmark(data);
      setValues(toFormValues(data));
      setStep("preview");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setStep("loading");
    await submitUrl(finalUrl);
  }

  async function handleConfirm() {
    if (!bookmark || !values) return;
    const invalid = validateFormValues(values, { requireUrl: false });
    if (invalid) { setPreviewError(invalid); return; }

    const changes = diffFormValues(bookmark, values);
    delete changes.url;
    let saved = bookmark;

    if (Object.keys(changes).length > 0) {
      setSaving(true);
      setPreviewError("");
      try {
        const res = await fetch(`/api/bookmarks/${bookmark.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
        saved = data as Bookmark;
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : "Could not save changes");
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (remember && shouldOfferRemember(saved.url, bookmark.category, saved.category)) {
      await saveCategoryRule(saved.url, saved.category);
    }

    pendingIdRef.current = null;
    onAdded(saved);
    onOpenChange(false);
  }

  function handleRetry() {
    setStep("input");
    setErrorMsg("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[85vh]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Add Bookmark
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">

          {/* ── Step: URL Input ── */}
          {step === "input" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste a URL — e.g. https://nextjs.org"
                  className="focus-visible:ring-1"
                  style={{ background: "var(--app-surface2)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="submit"
                  disabled={!url.trim()}
                  className="shrink-0"
                  style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}
                >
                  Add
                </Button>
              </div>
            </form>
          )}

          {/* ── Step: Loading ── */}
          {step === "loading" && (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--app-text-muted)" }} />
                <span>Fetching bookmark details…</span>
              </div>
              <div className="rounded-xl p-4 flex flex-col gap-3" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface2)" }}>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded-full" style={{ background: "var(--app-border)" }} />
                  <Skeleton className="h-4 w-48" style={{ background: "var(--app-border)" }} />
                </div>
                <Skeleton className="h-3 w-full" style={{ background: "var(--app-border)" }} />
                <Skeleton className="h-3 w-4/5" style={{ background: "var(--app-border)" }} />
                <div className="flex gap-2 mt-1">
                  <Skeleton className="h-5 w-16 rounded-md" style={{ background: "var(--app-border)" }} />
                  <Skeleton className="h-5 w-12 rounded-md" style={{ background: "var(--app-border)" }} />
                  <Skeleton className="h-5 w-14 rounded-md" style={{ background: "var(--app-border)" }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === "preview" && bookmark && values && (
            <div className="flex flex-col gap-3 pt-1">
              <p className="text-xs shrink-0" style={{ color: "var(--app-text-faint)" }}>
                Review and edit if needed, then click <strong style={{ color: "var(--app-text-muted)" }}>Save bookmark</strong>.
              </p>

              <div className="flex items-center gap-2 min-w-0">
                {bookmark.favicon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bookmark.favicon} alt="" width={16} height={16} className="rounded-sm shrink-0" />
                ) : null}
                <p className="text-[11px] truncate" style={{ color: "var(--app-text-faint)" }}>{bookmark.url}</p>
              </div>

              <BookmarkFormFields values={values} onChange={setValues} categories={categories} showUrl={false} />

              {shouldOfferRemember(bookmark.url, bookmark.category, values.category) && (
                <RememberCategoryCheckbox url={bookmark.url} category={values.category} checked={remember} onChange={setRemember} />
              )}

              {previewError && (
                <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
                  style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#f87171" }}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{previewError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleOpenChange(false)}
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={saving}
                  style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save bookmark
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Error ── */}
          {step === "error" && (
            <div className="flex flex-col gap-4 pt-1">
              <div className="flex items-start gap-2.5 rounded-lg p-3 text-sm" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#f87171" }}>
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleOpenChange(false)}
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={handleRetry}
                  style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

        </div>{/* end scrollable body */}
      </DialogContent>
    </Dialog>
  );
}
