"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/bookmark-input";
import type { Bookmark } from "@/lib/types";

export type BookmarkFormValues = {
  title: string;
  url: string;
  description: string;
  category: string;
  tags: string; // comma-separated
};

export function toFormValues(b: Bookmark): BookmarkFormValues {
  return {
    title: b.title,
    url: b.url,
    description: b.description,
    category: b.category,
    tags: b.tags.join(", "),
  };
}

function tagsFromText(text: string): string[] {
  return text.split(",").map((t) => t.trim()).filter(Boolean);
}

/** Returns only the fields that differ from the original bookmark. */
export function diffFormValues(original: Bookmark, values: BookmarkFormValues) {
  const changes: Partial<Pick<Bookmark, "title" | "url" | "description" | "category" | "tags">> = {};
  if (values.title.trim() !== original.title) changes.title = values.title.trim();
  if (values.url.trim() !== original.url) changes.url = values.url.trim();
  if (values.description.trim() !== original.description) changes.description = values.description.trim();
  if (values.category.trim() !== original.category) changes.category = values.category.trim();
  const tags = tagsFromText(values.tags);
  if (tags.join("\u0000") !== original.tags.join("\u0000")) changes.tags = tags;
  return changes;
}

const inputStyle: React.CSSProperties = {
  background: "var(--app-surface2)",
  borderColor: "var(--app-border)",
  color: "var(--app-text)",
};

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[11px] font-medium" style={{ color: "var(--app-text-faint)" }}>
      {children}
    </label>
  );
}

export function BookmarkFormFields({
  values,
  onChange,
  categories,
  showUrl = true,
  autoFocusTitle = false,
}: {
  values: BookmarkFormValues;
  onChange: (values: BookmarkFormValues) => void;
  categories: string[];
  showUrl?: boolean;
  autoFocusTitle?: boolean;
}) {
  const id = useId();
  const set = (key: keyof BookmarkFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...values, [key]: e.target.value });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input id={`${id}-title`} value={values.title} onChange={set("title")} maxLength={LIMITS.title}
          autoFocus={autoFocusTitle} className="h-8 text-sm focus-visible:ring-1" style={inputStyle} />
      </div>

      {showUrl && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-url`}>URL</Label>
          <Input id={`${id}-url`} value={values.url} onChange={set("url")} maxLength={LIMITS.url}
            spellCheck={false} autoComplete="off" className="h-8 text-xs focus-visible:ring-1" style={inputStyle} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-category`}>Category</Label>
          <Input id={`${id}-category`} value={values.category} onChange={set("category")} maxLength={LIMITS.category}
            list={`${id}-categories`} autoComplete="off" className="h-8 text-xs focus-visible:ring-1" style={inputStyle} />
          <datalist id={`${id}-categories`}>
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-tags`}>Tags (comma-separated)</Label>
          <Input id={`${id}-tags`} value={values.tags} onChange={set("tags")} placeholder="docs, team"
            autoComplete="off" className="h-8 text-xs focus-visible:ring-1" style={inputStyle} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <textarea id={`${id}-description`} value={values.description} onChange={set("description")}
          maxLength={LIMITS.description} rows={2} placeholder="Optional"
          className="w-full rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 resize-none border"
          style={inputStyle} />
      </div>
    </div>
  );
}

/** Client-side check mirroring the server's required fields. */
export function validateFormValues(values: BookmarkFormValues, { requireUrl }: { requireUrl: boolean }): string | null {
  if (!values.title.trim()) return "Title is required.";
  if (!values.category.trim()) return "Category is required.";
  if (requireUrl) {
    try {
      const u = new URL(values.url.trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") return "URL must start with http:// or https://";
    } catch {
      return "Enter a valid URL, including https://";
    }
  }
  return null;
}
