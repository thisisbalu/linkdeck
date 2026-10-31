import type { Theme } from "./theme";

/**
 * Page backgrounds (⋯ → Background). Each is pure CSS (see globals.css,
 * `html.bg-<id> body`). Glow colours come from the --glow-1/2/3 variables,
 * which follow the time of day when "Match time of day" is on.
 */
export type BackgroundId = "aurora" | "dots" | "midnight" | "mesh" | "soft" | "plain";

type BackgroundOption = { id: BackgroundId; label: string; swatch: string };

export const BACKGROUNDS: Record<Theme, BackgroundOption[]> = {
  dark: [
    { id: "aurora", label: "Aurora", swatch: "radial-gradient(circle at 20% 15%, #6366f1, transparent 60%), radial-gradient(circle at 90% 20%, #7c3aed, transparent 55%), #09090b" },
    { id: "dots", label: "Dot grid", swatch: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.35) 1px, transparent 0) 0 0/5px 5px, #09090b" },
    { id: "midnight", label: "Midnight", swatch: "linear-gradient(180deg, #1e2547, #0a0d18)" },
    { id: "mesh", label: "Mesh", swatch: "radial-gradient(circle at 0% 0%, #7c3aed, transparent 60%), radial-gradient(circle at 100% 20%, #3b82f6, transparent 60%), radial-gradient(circle at 70% 100%, #ec4899, transparent 60%), #0a0a12" },
    { id: "plain", label: "Plain", swatch: "#09090b" },
  ],
  light: [
    { id: "soft", label: "Soft glow", swatch: "radial-gradient(circle at 15% 10%, #c7d2fe, transparent 60%), radial-gradient(circle at 100% 0%, #bae6fd, transparent 55%), #f6f7fb" },
    { id: "dots", label: "Dot grid", swatch: "radial-gradient(circle at 1px 1px, rgba(0,0,0,.25) 1px, transparent 0) 0 0/5px 5px, #f6f7fb" },
    { id: "plain", label: "Plain", swatch: "#f1f3f4" },
  ],
};

export const DEFAULT_BACKGROUND: Record<Theme, BackgroundId> = { dark: "aurora", light: "soft" };
export const backgroundStorageKey = (theme: Theme) => `linkdeck-bg-${theme}`;
export const TIME_TINT_STORAGE_KEY = "linkdeck-bg-time";

export function isBackgroundFor(theme: Theme, id: string | null): id is BackgroundId {
  return !!id && BACKGROUNDS[theme].some((b) => b.id === id);
}

type Glow = { g1: string; g2: string; g3: string; strength: number };

/**
 * Glow colours for a moment in time, blended smoothly between four anchors:
 * night (1:00) deep blue/teal · morning (7:00) sunrise orange/pink ·
 * day (13:00) indigo/violet/sky · evening (19:00) sunset violet/orange/pink.
 * Each palette holds for half its period, then eases into the next. With
 * `timeTint` off, always the day palette.
 *
 * Self-contained (no outside references) because it is also serialized into
 * the pre-paint script in app/layout.tsx.
 */
export function glowFor(date: Date, timeTint: boolean): Glow {
  const anchors: [number, number[][], number][] = [
    [1, [[67, 56, 202], [30, 64, 175], [13, 148, 136]], 0.8],
    [7, [[251, 146, 60], [244, 114, 182], [129, 140, 248]], 0.85],
    [13, [[99, 102, 241], [124, 58, 237], [14, 165, 233]], 1],
    [19, [[168, 85, 247], [249, 115, 22], [236, 72, 153]], 0.95],
  ];
  const fmt = (c: number[]) => c.map((v) => Math.round(v)).join(" ");
  if (!timeTint) {
    const day = anchors[2];
    return { g1: fmt(day[1][0]), g2: fmt(day[1][1]), g3: fmt(day[1][2]), strength: day[2] };
  }
  const h = date.getHours() + date.getMinutes() / 60;
  let i = anchors.length - 1;
  for (let k = 0; k < anchors.length; k++) if (h >= anchors[k][0]) i = k;
  const a = anchors[i];
  const b = anchors[(i + 1) % anchors.length];
  const start = a[0];
  const end = b[0] > start ? b[0] : b[0] + 24;
  const linear = Math.min(1, Math.max(0, ((h < start ? h + 24 : h) - start) / (end - start)));
  // Hold each palette for the first half of its period, then ease into the next.
  const u = Math.min(1, Math.max(0, (linear - 0.5) / 0.5));
  const t = u * u * (3 - 2 * u);
  const mix = (x: number[], y: number[]) => x.map((v, n) => v + (y[n] - v) * t);
  return {
    g1: fmt(mix(a[1][0], b[1][0])),
    g2: fmt(mix(a[1][1], b[1][1])),
    g3: fmt(mix(a[1][2], b[1][2])),
    strength: Math.round((a[2] + (b[2] - a[2]) * t) * 100) / 100,
  };
}

export function applyGlow(root: HTMLElement, glow: Glow): void {
  root.style.setProperty("--glow-1", glow.g1);
  root.style.setProperty("--glow-2", glow.g2);
  root.style.setProperty("--glow-3", glow.g3);
  root.style.setProperty("--glow-strength", String(glow.strength));
}

/**
 * Inline <head> script: applies the saved theme, background and glow before
 * the first paint, so the page never flashes the wrong look.
 */
export function earlyAppearanceScript(): string {
  const config = {
    themeKey: "linkdeck-theme",
    legacyThemeKey: "kp-theme",
    timeKey: TIME_TINT_STORAGE_KEY,
    defaults: DEFAULT_BACKGROUND,
    allowed: { dark: BACKGROUNDS.dark.map((b) => b.id), light: BACKGROUNDS.light.map((b) => b.id) },
  };
  return `(function(glowFor, c){try{
var s=localStorage, r=document.documentElement;
var theme=s.getItem(c.themeKey)||s.getItem(c.legacyThemeKey); theme=theme==="light"?"light":"dark";
r.classList.remove("dark","theme-light"); r.classList.add(theme==="dark"?"dark":"theme-light");
var bg=s.getItem("linkdeck-bg-"+theme); if(c.allowed[theme].indexOf(bg)<0) bg=c.defaults[theme];
r.classList.add("bg-"+bg);
var g=glowFor(new Date(), s.getItem(c.timeKey)!=="off");
r.style.setProperty("--glow-1",g.g1); r.style.setProperty("--glow-2",g.g2); r.style.setProperty("--glow-3",g.g3); r.style.setProperty("--glow-strength",String(g.strength));
}catch(e){}})(${glowFor.toString()}, ${JSON.stringify(config)});`;
}
