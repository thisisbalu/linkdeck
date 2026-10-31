/**
 * Tests for lib/backgrounds.ts
 */

import { describe, it, expect } from "vitest";
import { BACKGROUNDS, DEFAULT_BACKGROUND, earlyAppearanceScript, glowFor, isBackgroundFor } from "@/lib/backgrounds";

const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m);

describe("glowFor", () => {
  it("uses the day palette when time tint is off", () => {
    expect(glowFor(at(3), false)).toEqual(glowFor(at(13), true));
  });

  it("hits each anchor exactly and holds it for half the period", () => {
    expect(glowFor(at(13), true)).toEqual({ g1: "99 102 241", g2: "124 58 237", g3: "14 165 233", strength: 1 });
    expect(glowFor(at(15, 59), true)).toEqual(glowFor(at(13), true));
    expect(glowFor(at(7), true).g1).toBe("251 146 60");
    expect(glowFor(at(19), true).g2).toBe("249 115 22");
  });

  it("blends smoothly into the next palette, wrapping past midnight", () => {
    const before = glowFor(at(17, 30), true); // halfway through the day → evening blend
    expect(before).not.toEqual(glowFor(at(13), true));
    expect(before).not.toEqual(glowFor(at(19), true));
    expect(glowFor(at(0, 30), true)).not.toEqual(glowFor(at(1), true));
    expect(glowFor(at(1), true).g1).toBe("67 56 202");
    for (let h = 0; h < 24; h++) {
      for (const c of Object.values(glowFor(at(h), true)).slice(0, 3) as string[]) {
        expect(c.split(" ").map(Number).every((v) => v >= 0 && v <= 255)).toBe(true);
      }
    }
  });
});

describe("options", () => {
  it("has valid defaults per theme and validates ids per theme", () => {
    expect(isBackgroundFor("dark", DEFAULT_BACKGROUND.dark)).toBe(true);
    expect(isBackgroundFor("light", DEFAULT_BACKGROUND.light)).toBe(true);
    expect(isBackgroundFor("light", "mesh")).toBe(false);
    expect(isBackgroundFor("dark", "nope")).toBe(false);
    expect(BACKGROUNDS.dark.map((b) => b.id)).toContain("plain");
  });

  it("produces a self-contained pre-paint script", () => {
    const html = { classes: new Set(["dark", "bg-aurora"]), vars: {} as Record<string, string> };
    const documentElement = {
      classList: { add: (c: string) => html.classes.add(c), remove: (...c: string[]) => c.forEach((x) => html.classes.delete(x)) },
      style: { setProperty: (k: string, v: string) => { html.vars[k] = v; } },
    };
    const store: Record<string, string> = { "linkdeck-theme": "light", "linkdeck-bg-light": "dots", "linkdeck-bg-time": "off" };
    const localStorage = { getItem: (k: string) => store[k] ?? null };
    new Function("document", "localStorage", earlyAppearanceScript())({ documentElement }, localStorage);
    expect(html.classes.has("theme-light")).toBe(true);
    expect(html.classes.has("dark")).toBe(false);
    expect(html.classes.has("bg-dots")).toBe(true);
    expect(html.vars["--glow-1"]).toBe("99 102 241");
  });
});
