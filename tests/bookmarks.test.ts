/**
 * Tests for lib/bookmarks.ts
 * Covers: CRUD operations, duplicate detection, reorder, write serialization
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Bookmark } from "@/lib/types";

// Mock fs-store so we don't touch disk
vi.mock("@/lib/fs-store", () => ({
  readJSON: vi.fn(),
  writeJSON: vi.fn(),
  ensureDir: vi.fn(),
}));

vi.mock("@/lib/backup", () => ({ backupIfDue: vi.fn() }));

import * as fsStore from "@/lib/fs-store";
import {
  readBookmarks,
  addBookmark,
  deleteBookmark,
  updateBookmark,
  reorderBookmarks,
  setCategories,
  bulkUpdate,
  bulkDelete,
  recordVisit,
  setChromeUsage,
  BookmarkNotFoundError,
  DuplicateBookmarkError,
} from "@/lib/bookmarks";

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: crypto.randomUUID(),
    url: "https://example.com",
    title: "Example",
    description: "An example",
    category: "General",
    tags: ["example"],
    favicon: "/favicons/example.com.png",
    addedAt: new Date().toISOString(),
    pinned: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readBookmarks", () => {
  it("returns empty array when file is empty", async () => {
    vi.mocked(fsStore.readJSON).mockResolvedValue([]);
    const result = await readBookmarks();
    expect(result).toEqual([]);
  });

  it("returns bookmarks from store", async () => {
    const b = makeBookmark({ title: "Test" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([b]);
    const result = await readBookmarks();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Test");
  });
});

describe("addBookmark", () => {
  it("appends bookmark to existing list", async () => {
    const existing = makeBookmark({ title: "Existing" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([existing]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    const newBookmark = makeBookmark({ title: "New", url: "https://new.example.com" });
    await addBookmark(newBookmark);

    const written = vi.mocked(fsStore.writeJSON).mock.calls[0][1] as Bookmark[];
    expect(written).toHaveLength(2);
    expect(written.some((b) => b.title === "New")).toBe(true);
  });
});

describe("deleteBookmark", () => {
  it("removes bookmark by id", async () => {
    const b1 = makeBookmark({ id: "aaa", title: "Keep" });
    const b2 = makeBookmark({ id: "bbb", title: "Delete" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([b1, b2]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    await deleteBookmark("bbb");

    const written = vi.mocked(fsStore.writeJSON).mock.calls[0][1] as Bookmark[];
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe("aaa");
  });

  it("does nothing if id not found", async () => {
    const b = makeBookmark({ id: "aaa" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([b]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    await deleteBookmark("nonexistent");

    const written = vi.mocked(fsStore.writeJSON).mock.calls[0][1] as Bookmark[];
    expect(written).toHaveLength(1);
  });
});

describe("updateBookmark", () => {
  it("updates fields on the matching bookmark", async () => {
    const b = makeBookmark({ id: "aaa", title: "Old Title", pinned: false });
    vi.mocked(fsStore.readJSON).mockResolvedValue([b]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    const updated = await updateBookmark("aaa", { title: "New Title", pinned: true });

    expect(updated.title).toBe("New Title");
    expect(updated.pinned).toBe(true);
    expect(updated.id).toBe("aaa"); // id unchanged
  });

  it("throws if bookmark not found", async () => {
    vi.mocked(fsStore.readJSON).mockResolvedValue([]);
    await expect(updateBookmark("nonexistent", { title: "X" })).rejects.toBeInstanceOf(BookmarkNotFoundError);
  });

  it("rejects a URL already used by another bookmark", async () => {
    const a = makeBookmark({ id: "aaa", url: "https://a.com/page" });
    const b = makeBookmark({ id: "bbb", url: "https://b.com" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([a, b]);

    await expect(updateBookmark("bbb", { url: "https://A.com/page/" })).rejects.toBeInstanceOf(DuplicateBookmarkError);
    expect(fsStore.writeJSON).not.toHaveBeenCalled();
  });

  it("allows keeping its own URL", async () => {
    const a = makeBookmark({ id: "aaa", url: "https://a.com/page" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([a]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    const updated = await updateBookmark("aaa", { url: "https://a.com/page/" });
    expect(updated.url).toBe("https://a.com/page/");
  });
});

describe("addBookmark duplicates", () => {
  it("throws DuplicateBookmarkError with the existing bookmark", async () => {
    const existing = makeBookmark({ url: "https://example.com/docs" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([existing]);

    const err = await addBookmark(makeBookmark({ url: "https://EXAMPLE.com/docs/" })).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateBookmarkError);
    expect((err as DuplicateBookmarkError).existing.id).toBe(existing.id);
    expect(fsStore.writeJSON).not.toHaveBeenCalled();
  });
});

describe("reorderBookmarks", () => {
  it("applies sortOrder and category per item and ignores unknown ids", async () => {
    const a = makeBookmark({ id: "aaa", category: "General" });
    const b = makeBookmark({ id: "bbb", category: "General" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([a, b]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    await reorderBookmarks([
      { id: "bbb", sortOrder: 0, category: "GitHub" },
      { id: "aaa", sortOrder: 10 },
      { id: "zzz", sortOrder: 20 },
    ]);

    const written = vi.mocked(fsStore.writeJSON).mock.calls[0][1] as Bookmark[];
    expect(written).toHaveLength(2);
    expect(written.find((x) => x.id === "bbb")).toMatchObject({ sortOrder: 0, category: "GitHub" });
    expect(written.find((x) => x.id === "aaa")).toMatchObject({ sortOrder: 10, category: "General" });
  });
});

describe("write serialization", () => {
  it("does not lose writes when adds run concurrently", async () => {
    // Simulate a real file: reads return the latest written state.
    let store: Bookmark[] = [];
    vi.mocked(fsStore.readJSON).mockImplementation(async () => structuredClone(store));
    vi.mocked(fsStore.writeJSON).mockImplementation(async (_p, data) => {
      await new Promise((r) => setTimeout(r, 5));
      store = data as Bookmark[];
    });

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => addBookmark(makeBookmark({ url: `https://site${i}.com` })))
    );

    expect(store).toHaveLength(10);
  });

  it("only one of two concurrent adds of the same URL succeeds", async () => {
    let store: Bookmark[] = [];
    vi.mocked(fsStore.readJSON).mockImplementation(async () => structuredClone(store));
    vi.mocked(fsStore.writeJSON).mockImplementation(async (_p, data) => {
      await new Promise((r) => setTimeout(r, 5));
      store = data as Bookmark[];
    });

    const results = await Promise.allSettled([
      addBookmark(makeBookmark({ url: "https://same.com" })),
      addBookmark(makeBookmark({ url: "https://same.com/" })),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(store).toHaveLength(1);
  });

  it("keeps processing after a failed operation", async () => {
    vi.mocked(fsStore.readJSON).mockResolvedValue([]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    await expect(updateBookmark("missing", { title: "x" })).rejects.toThrow();
    await expect(addBookmark(makeBookmark())).resolves.toBeDefined();
  });
});

describe("setCategories", () => {
  it("updates only changed bookmarks and returns them", async () => {
    const a = makeBookmark({ id: "aaa", category: "General" });
    const b = makeBookmark({ id: "bbb", category: "IBM" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([a, b]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    const changed = await setCategories([
      { id: "aaa", category: "IBM" },
      { id: "bbb", category: "IBM" },
      { id: "zzz", category: "X" },
    ]);

    expect(changed.map((x) => x.id)).toEqual(["aaa"]);
    const written = vi.mocked(fsStore.writeJSON).mock.calls[0][1] as Bookmark[];
    expect(written.find((x) => x.id === "aaa")?.category).toBe("IBM");
  });

  it("skips writing when nothing changes", async () => {
    vi.mocked(fsStore.readJSON).mockResolvedValue([makeBookmark({ id: "aaa", category: "IBM" })]);
    await setCategories([{ id: "aaa", category: "IBM" }]);
    expect(fsStore.writeJSON).not.toHaveBeenCalled();
  });
});

describe("bulk operations", () => {
  it("bulkUpdate pins/moves only the given ids and returns changed ones", async () => {
    const a = makeBookmark({ id: "a", url: "https://a.com", category: "X" });
    const b = makeBookmark({ id: "b", url: "https://b.com", category: "Y", pinned: true });
    const c = makeBookmark({ id: "c", url: "https://c.com", category: "X" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([a, b, c]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    const changed = await bulkUpdate(["a", "b", "missing"], { pinned: true });
    expect(changed.map((x) => x.id)).toEqual(["a"]);

    vi.mocked(fsStore.readJSON).mockResolvedValue([a, b, c]);
    const moved = await bulkUpdate(["a", "b"], { category: "Z" });
    expect(moved.map((x) => [x.id, x.category])).toEqual([["a", "Z"], ["b", "Z"]]);
  });

  it("bulkDelete removes the given ids", async () => {
    vi.mocked(fsStore.readJSON).mockResolvedValue([
      makeBookmark({ id: "a", url: "https://a.com" }),
      makeBookmark({ id: "b", url: "https://b.com" }),
    ]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);
    expect(await bulkDelete(["a", "zzz"])).toBe(1);
    const written = vi.mocked(fsStore.writeJSON).mock.calls[0][1] as Bookmark[];
    expect(written.map((x) => x.id)).toEqual(["b"]);
  });

  it("recordVisit increments count and stamps time", async () => {
    vi.mocked(fsStore.readJSON).mockResolvedValue([makeBookmark({ id: "a", visitCount: 2 })]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);
    const at = new Date("2026-10-27T10:00:00Z");
    const updated = await recordVisit("a", at);
    expect(updated.visitCount).toBe(3);
    expect(updated.lastVisitedAt).toBe(at.toISOString());
    vi.mocked(fsStore.readJSON).mockResolvedValue([]);
    await expect(recordVisit("nope")).rejects.toBeInstanceOf(BookmarkNotFoundError);
  });
});

describe("setChromeUsage", () => {
  it("stores counts, clears stale times, and skips writing when nothing changed", async () => {
    const a = makeBookmark({ id: "a", url: "https://a.com" });
    const c = makeBookmark({ id: "c", url: "https://c.com", chromeVisitCount: 4, lastChromeVisitAt: "2026-10-01T00:00:00.000Z" });
    vi.mocked(fsStore.readJSON).mockResolvedValue([a, c]);
    vi.mocked(fsStore.writeJSON).mockResolvedValue(undefined);

    expect(await setChromeUsage([
      { id: "a", visits: 2, lastVisitAt: "2026-10-27T10:00:00.000Z" },
      { id: "c", visits: 0, lastVisitAt: null },
      { id: "zzz", visits: 9, lastVisitAt: "2026-10-27T10:00:00.000Z" },
    ])).toBe(2);
    const written = vi.mocked(fsStore.writeJSON).mock.calls[0][1] as Bookmark[];
    expect(written.find((x) => x.id === "a")).toMatchObject({ chromeVisitCount: 2, lastChromeVisitAt: "2026-10-27T10:00:00.000Z" });
    expect(written.find((x) => x.id === "c")!.chromeVisitCount).toBe(0);
    expect(written.find((x) => x.id === "c")!.lastChromeVisitAt).toBeUndefined();

    vi.clearAllMocks();
    vi.mocked(fsStore.readJSON).mockResolvedValue(written);
    expect(await setChromeUsage([{ id: "a", visits: 2, lastVisitAt: "2026-10-27T10:00:00.000Z" }])).toBe(0);
    expect(fsStore.writeJSON).not.toHaveBeenCalled();
  });
});
