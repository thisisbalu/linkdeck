import { isHttpUrl } from "./url";
import type { Bookmark } from "./types";

export const LIMITS = {
  title: 300,
  url: 2048,
  description: 1000,
  category: 60,
  tag: 40,
  tags: 20,
} as const;

export type EditableFields = Pick<Bookmark, "title" | "url" | "description" | "category" | "tags" | "pinned">;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const EDITABLE_KEYS = ["title", "url", "description", "category", "tags", "pinned"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseString(
  value: unknown,
  field: string,
  max: number,
  { required }: { required: boolean }
): Result<string> {
  if (typeof value !== "string") return { ok: false, error: `${field} must be a string` };
  const trimmed = value.trim();
  if (required && !trimmed) return { ok: false, error: `${field} cannot be empty` };
  if (trimmed.length > max) return { ok: false, error: `${field} must be at most ${max} characters` };
  return { ok: true, value: trimmed };
}

function parseUrl(value: unknown): Result<string> {
  const s = parseString(value, "url", LIMITS.url, { required: true });
  if (!s.ok) return s;
  if (!isHttpUrl(s.value)) return { ok: false, error: "url must be a valid http(s) URL" };
  return s;
}

/** Trims, drops empties and case-insensitive duplicates. */
export function parseTags(value: unknown): Result<string[]> {
  if (!Array.isArray(value)) return { ok: false, error: "tags must be an array of strings" };
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of value) {
    if (typeof t !== "string") return { ok: false, error: "tags must be an array of strings" };
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (trimmed.length > LIMITS.tag) return { ok: false, error: `each tag must be at most ${LIMITS.tag} characters` };
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(trimmed);
  }
  if (tags.length > LIMITS.tags) return { ok: false, error: `at most ${LIMITS.tags} tags allowed` };
  return { ok: true, value: tags };
}

/**
 * Validates a PATCH body. Only editable fields are accepted; anything else
 * (id, favicon, addedAt, sortOrder, unknown keys) is rejected.
 */
export function parseBookmarkUpdate(body: unknown): Result<Partial<EditableFields>> {
  if (!isPlainObject(body)) return { ok: false, error: "Expected a JSON object" };

  const unknownKeys = Object.keys(body).filter((k) => !(EDITABLE_KEYS as readonly string[]).includes(k));
  if (unknownKeys.length) return { ok: false, error: `Unsupported field(s): ${unknownKeys.join(", ")}` };

  const updates: Partial<EditableFields> = {};

  if ("title" in body) {
    const r = parseString(body.title, "title", LIMITS.title, { required: true });
    if (!r.ok) return r;
    updates.title = r.value;
  }
  if ("url" in body) {
    const r = parseUrl(body.url);
    if (!r.ok) return r;
    updates.url = r.value;
  }
  if ("description" in body) {
    const r = parseString(body.description, "description", LIMITS.description, { required: false });
    if (!r.ok) return r;
    updates.description = r.value;
  }
  if ("category" in body) {
    const r = parseString(body.category, "category", LIMITS.category, { required: true });
    if (!r.ok) return r;
    updates.category = r.value;
  }
  if ("tags" in body) {
    const r = parseTags(body.tags);
    if (!r.ok) return r;
    updates.tags = r.value;
  }
  if ("pinned" in body) {
    if (typeof body.pinned !== "boolean") return { ok: false, error: "pinned must be a boolean" };
    updates.pinned = body.pinned;
  }

  if (Object.keys(updates).length === 0) return { ok: false, error: "No fields to update" };
  return { ok: true, value: updates };
}

type NewBookmarkInput = {
  url: string;
  title?: string;
  description?: string;
  faviconUrl?: string;
};

export function parseNewBookmark(body: unknown): Result<NewBookmarkInput> {
  if (!isPlainObject(body)) return { ok: false, error: "Expected a JSON object" };
  if (body.url === undefined) return { ok: false, error: "url is required" };

  const url = parseUrl(body.url);
  if (!url.ok) return url;
  const input: NewBookmarkInput = { url: url.value };

  if (body.title !== undefined) {
    const r = parseString(body.title, "title", LIMITS.title, { required: false });
    if (!r.ok) return r;
    if (r.value) input.title = r.value;
  }
  if (body.description !== undefined) {
    const r = parseString(body.description, "description", LIMITS.description, { required: false });
    if (!r.ok) return r;
    if (r.value) input.description = r.value;
  }
  if (body.faviconUrl !== undefined) {
    if (typeof body.faviconUrl !== "string") return { ok: false, error: "faviconUrl must be a string" };
    if (isHttpUrl(body.faviconUrl)) input.faviconUrl = body.faviconUrl.trim();
  }
  return { ok: true, value: input };
}

export type ReorderItem = { id: string; sortOrder: number; category?: string };

/**
 * Validates a reorder body: `{ items: [{ id, sortOrder, category? }] }`.
 */
export function parseReorder(body: unknown): Result<ReorderItem[]> {
  if (!isPlainObject(body) || !Array.isArray(body.items)) {
    return { ok: false, error: "items must be an array" };
  }
  const items: ReorderItem[] = [];
  for (const raw of body.items) {
    if (!isPlainObject(raw) || typeof raw.id !== "string" || !raw.id) {
      return { ok: false, error: "each item needs a string id" };
    }
    if (typeof raw.sortOrder !== "number" || !Number.isFinite(raw.sortOrder)) {
      return { ok: false, error: "each item needs a numeric sortOrder" };
    }
    const item: ReorderItem = { id: raw.id, sortOrder: raw.sortOrder };
    if (raw.category !== undefined) {
      const r = parseString(raw.category, "category", LIMITS.category, { required: true });
      if (!r.ok) return r;
      item.category = r.value;
    }
    items.push(item);
  }
  return { ok: true, value: items };
}

const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

export function parseRuleHost(value: unknown): Result<string> {
  if (typeof value !== "string") return { ok: false, error: "host is required" };
  const host = value.trim().toLowerCase().replace(/^www\./, "");
  if (!host || host.length > 253 || !HOST_RE.test(host)) return { ok: false, error: "host is not a valid hostname" };
  return { ok: true, value: host };
}

/** Body for PUT /api/category-rules: `{ url, category }` (host is derived from url). */
export function parseRuleInput(body: unknown): Result<{ url: string; category: string }> {
  if (!isPlainObject(body)) return { ok: false, error: "Expected a JSON object" };
  const url = parseUrl(body.url);
  if (!url.ok) return url;
  const category = parseString(body.category, "category", LIMITS.category, { required: true });
  if (!category.ok) return category;
  return { ok: true, value: { url: url.value, category: category.value } };
}

/** Body for POST /api/bookmarks/categorize: `{ items: [{ id, category }], remember? }`. */
export function parseCategorizeBody(
  body: unknown
): Result<{ items: { id: string; category: string }[]; remember: boolean }> {
  if (!isPlainObject(body) || !Array.isArray(body.items)) return { ok: false, error: "items must be an array" };
  if (body.remember !== undefined && typeof body.remember !== "boolean") {
    return { ok: false, error: "remember must be a boolean" };
  }
  const items: { id: string; category: string }[] = [];
  for (const raw of body.items) {
    if (!isPlainObject(raw) || typeof raw.id !== "string" || !raw.id) {
      return { ok: false, error: "each item needs a string id" };
    }
    const category = parseString(raw.category, "category", LIMITS.category, { required: true });
    if (!category.ok) return category;
    items.push({ id: raw.id, category: category.value });
  }
  return { ok: true, value: { items, remember: body.remember === true } };
}

type BulkAction =
  | { action: "pin" | "unpin" | "delete"; ids: string[] }
  | { action: "move"; ids: string[]; category: string };

const MAX_BULK = 5000;

function parseIds(value: unknown): Result<string[]> {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, error: "ids must be a non-empty array" };
  if (value.length > MAX_BULK) return { ok: false, error: `at most ${MAX_BULK} ids` };
  if (!value.every((id) => typeof id === "string" && id.length > 0 && id.length <= 100)) {
    return { ok: false, error: "ids must be strings" };
  }
  return { ok: true, value: Array.from(new Set(value as string[])) };
}

/** Body for POST /api/bookmarks/bulk. */
export function parseBulkBody(body: unknown): Result<BulkAction> {
  if (!isPlainObject(body)) return { ok: false, error: "Expected a JSON object" };
  const ids = parseIds(body.ids);
  if (!ids.ok) return ids;
  switch (body.action) {
    case "pin":
    case "unpin":
    case "delete":
      return { ok: true, value: { action: body.action, ids: ids.value } };
    case "move": {
      const category = parseString(body.category, "category", LIMITS.category, { required: true });
      if (!category.ok) return category;
      return { ok: true, value: { action: "move", ids: ids.value, category: category.value } };
    }
    default:
      return { ok: false, error: "action must be pin, unpin, move or delete" };
  }
}

/** Optional `{ ids }` body for POST /api/links/check (omit to check everything). */
export function parseLinkCheckBody(body: unknown): Result<{ ids?: string[] }> {
  if (body === null || body === undefined) return { ok: true, value: {} };
  if (!isPlainObject(body)) return { ok: false, error: "Expected a JSON object" };
  if (body.ids === undefined) return { ok: true, value: {} };
  const ids = parseIds(body.ids);
  return ids.ok ? { ok: true, value: { ids: ids.value } } : ids;
}

/** Body for POST /api/usage/chrome: `{ items: [{ id, visits, lastVisitAt }] }`. */
export function parseChromeUsageBody(
  body: unknown
): Result<{ id: string; visits: number; lastVisitAt: string | null }[]> {
  if (!isPlainObject(body) || !Array.isArray(body.items)) return { ok: false, error: "items must be an array" };
  if (body.items.length > MAX_BULK) return { ok: false, error: `at most ${MAX_BULK} items` };
  const out: { id: string; visits: number; lastVisitAt: string | null }[] = [];
  for (const raw of body.items) {
    if (!isPlainObject(raw) || typeof raw.id !== "string" || !raw.id) return { ok: false, error: "each item needs a string id" };
    if (typeof raw.visits !== "number" || !Number.isInteger(raw.visits) || raw.visits < 0 || raw.visits > 1_000_000) {
      return { ok: false, error: "visits must be a non-negative integer" };
    }
    let last: string | null = null;
    if (raw.lastVisitAt !== null && raw.lastVisitAt !== undefined) {
      if (typeof raw.lastVisitAt !== "string" || Number.isNaN(Date.parse(raw.lastVisitAt))) {
        return { ok: false, error: "lastVisitAt must be an ISO date or null" };
      }
      last = new Date(raw.lastVisitAt).toISOString();
    }
    if (raw.visits > 0 && !last) return { ok: false, error: "lastVisitAt is required when visits > 0" };
    out.push({ id: raw.id, visits: raw.visits, lastVisitAt: raw.visits > 0 ? last : null });
  }
  return { ok: true, value: out };
}
