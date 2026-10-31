"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  BookmarkFormFields,
  diffFormValues,
  toFormValues,
  validateFormValues,
  type BookmarkFormValues,
} from "@/components/BookmarkFormFields";
import { RememberCategoryCheckbox, saveCategoryRule, shouldOfferRemember } from "@/components/RememberCategoryCheckbox";
import type { Bookmark } from "@/lib/types";

interface EditBookmarkDialogProps {
  bookmark: Bookmark | null;
  categories: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: (bookmark: Bookmark) => void;
}

export function EditBookmarkDialog({ bookmark, categories, onOpenChange, onSaved }: EditBookmarkDialogProps) {
  const [values, setValues] = useState<BookmarkFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (bookmark) {
      setValues(toFormValues(bookmark));
      setError("");
      setSaving(false);
      setRemember(true);
    }
  }, [bookmark]);

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    if (!bookmark || !values) return;

    const invalid = validateFormValues(values, { requireUrl: true });
    if (invalid) { setError(invalid); return; }

    const changes = diffFormValues(bookmark, values);
    if (Object.keys(changes).length === 0) { onOpenChange(false); return; }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      const saved = data as Bookmark;
      if (remember && shouldOfferRemember(saved.url, bookmark.category, saved.category)) {
        await saveCategoryRule(saved.url, saved.category);
      }
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={bookmark !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[85vh]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Edit Bookmark
          </DialogTitle>
        </DialogHeader>

        {values && bookmark && (
          <form onSubmit={handleSave} className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 pt-1">
            <BookmarkFormFields values={values} onChange={setValues} categories={categories} autoFocusTitle />

            {shouldOfferRemember(values.url, bookmark.category, values.category) && (
              <RememberCategoryCheckbox url={values.url} category={values.category} checked={remember} onChange={setRemember} />
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
                style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#f87171" }}>
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 shrink-0">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} style={{ color: "var(--app-text-muted)" }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} style={{ background: "var(--app-cta-bg)", color: "var(--app-cta-text)" }}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
