/**
 * Tests for lib/favicon.ts helpers
 */

import { describe, it, expect } from "vitest";
import { isFaviconFileName } from "@/lib/favicon";

describe("isFaviconFileName", () => {
  it("accepts host-style png names only", () => {
    expect(isFaviconFileName("github.com.png")).toBe(true);
    expect(isFaviconFileName("ibm-my.sharepoint.com.png")).toBe(true);
    for (const bad of ["../bookmarks.json", "..%2Fx.png", "a/b.png", "x.svg", ".png", "a..b.png", "github.com.png.exe"]) {
      expect(isFaviconFileName(bad)).toBe(false);
    }
  });
});
