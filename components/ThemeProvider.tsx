"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { type Theme, DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";
import {
  applyGlow, backgroundStorageKey, BACKGROUNDS, DEFAULT_BACKGROUND, glowFor, isBackgroundFor,
  TIME_TINT_STORAGE_KEY, type BackgroundId,
} from "@/lib/backgrounds";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Background for the current theme. */
  background: BackgroundId;
  setBackground: (b: BackgroundId) => void;
  timeTint: boolean;
  setTimeTint: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  background: DEFAULT_BACKGROUND[DEFAULT_THEME],
  setBackground: () => {},
  timeTint: true,
  setTimeTint: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function savedBackground(theme: Theme): BackgroundId {
  const saved = read(backgroundStorageKey(theme));
  return isBackgroundFor(theme, saved) ? saved : DEFAULT_BACKGROUND[theme];
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [background, setBackgroundState] = useState<BackgroundId>(DEFAULT_BACKGROUND[DEFAULT_THEME]);
  const [timeTint, setTimeTintState] = useState(true);

  // Load persisted settings on mount (the pre-paint script in layout.tsx has
  // already applied them to <html>, so this only syncs React state).
  useEffect(() => {
    // "kp-theme" is the key used before the rename to Linkdeck.
    const saved = read(THEME_STORAGE_KEY) ?? read("kp-theme");
    const t: Theme = saved === "light" ? "light" : "dark";
    setThemeState(t);
    setBackgroundState(savedBackground(t));
    setTimeTintState(read(TIME_TINT_STORAGE_KEY) !== "off");
  }, []);

  // Theme + background classes on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "dark");
    root.classList.add(theme === "dark" ? "dark" : "theme-light");
    for (const c of Array.from(root.classList)) if (c.startsWith("bg-")) root.classList.remove(c);
    root.classList.add(`bg-${background}`);
  }, [theme, background]);

  // Glow colours; with "Match time of day" they drift every few minutes.
  useEffect(() => {
    const update = () => applyGlow(document.documentElement, glowFor(new Date(), timeTint));
    update();
    if (!timeTint) return;
    const timer = setInterval(update, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [timeTint]);

  function setTheme(t: Theme) {
    setThemeState(t);
    setBackgroundState(savedBackground(t));
    write(THEME_STORAGE_KEY, t);
  }

  function setBackground(b: BackgroundId) {
    if (!BACKGROUNDS[theme].some((o) => o.id === b)) return;
    setBackgroundState(b);
    write(backgroundStorageKey(theme), b);
  }

  function setTimeTint(on: boolean) {
    setTimeTintState(on);
    write(TIME_TINT_STORAGE_KEY, on ? "on" : "off");
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, background, setBackground, timeTint, setTimeTint }}>
      {children}
    </ThemeContext.Provider>
  );
}
