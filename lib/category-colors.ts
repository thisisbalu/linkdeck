/**
 * Work-context category → Tailwind color classes mapping.
 * Categories are organised around tools and content types, not tech stack.
 */

type CategoryColor = {
  badge: string;   // bg + text + border for the badge
  chip: string;    // active chip style in filter bar
  dot: string;     // small colored dot in grouped list header
};

const CATEGORY_COLORS: Record<string, CategoryColor> = {
  // ── Document types ──────────────────────────────────────────────────────────
  "Documents":     { badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",       chip: "bg-blue-500/20 text-blue-300 border-blue-500/40",       dot: "bg-blue-400" },
  "Sheets":        { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", chip: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", dot: "bg-emerald-400" },
  "Slides":        { badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", chip: "bg-orange-500/20 text-orange-300 border-orange-500/40", dot: "bg-orange-400" },

  // ── Work tools ──────────────────────────────────────────────────────────────
  "GitHub":        { badge: "bg-zinc-400/15 text-zinc-300 border-zinc-400/30",       chip: "bg-zinc-400/20 text-zinc-200 border-zinc-400/40",       dot: "bg-zinc-300" },
  "Jira":          { badge: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30", chip: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40", dot: "bg-indigo-400" },
  "Confluence":    { badge: "bg-sky-500/15 text-sky-400 border-sky-500/30",          chip: "bg-sky-500/20 text-sky-300 border-sky-500/40",          dot: "bg-sky-400" },
  "Slack":         { badge: "bg-pink-500/15 text-pink-400 border-pink-500/30",       chip: "bg-pink-500/20 text-pink-300 border-pink-500/40",       dot: "bg-pink-400" },
  "Mural":         { badge: "bg-purple-500/15 text-purple-400 border-purple-500/30", chip: "bg-purple-500/20 text-purple-300 border-purple-500/40", dot: "bg-purple-400" },
  "Box":           { badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",       chip: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",       dot: "bg-cyan-400" },
  "Zoom":          { badge: "bg-blue-600/15 text-blue-400 border-blue-600/30",       chip: "bg-blue-600/20 text-blue-300 border-blue-600/40",       dot: "bg-blue-500" },
  "ServiceNow":    { badge: "bg-green-500/15 text-green-400 border-green-500/30",    chip: "bg-green-500/20 text-green-300 border-green-500/40",    dot: "bg-green-400" },

  // ── Platforms ───────────────────────────────────────────────────────────────
  "IBM":           { badge: "bg-blue-700/15 text-blue-300 border-blue-700/30",       chip: "bg-blue-700/20 text-blue-200 border-blue-700/40",       dot: "bg-blue-300" },
  "HashiCorp":     { badge: "bg-zinc-300/15 text-zinc-200 border-zinc-300/30",       chip: "bg-zinc-300/20 text-zinc-100 border-zinc-300/40",       dot: "bg-zinc-200" },
  "Okta / SSO":    { badge: "bg-red-500/15 text-red-400 border-red-500/30",          chip: "bg-red-500/20 text-red-300 border-red-500/40",          dot: "bg-red-400" },
  "AWS":           { badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",    chip: "bg-amber-500/20 text-amber-300 border-amber-500/40",    dot: "bg-amber-400" },
  "Azure":         { badge: "bg-blue-400/15 text-blue-300 border-blue-400/30",       chip: "bg-blue-400/20 text-blue-200 border-blue-400/40",       dot: "bg-blue-300" },
  "GCP":           { badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", chip: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", dot: "bg-yellow-400" },

  // ── Engineering ─────────────────────────────────────────────────────────────
  "Infrastructure":{ badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",      chip: "bg-rose-500/20 text-rose-300 border-rose-500/40",       dot: "bg-rose-400" },
  "AI / ML":       { badge: "bg-violet-500/15 text-violet-400 border-violet-500/30", chip: "bg-violet-500/20 text-violet-300 border-violet-500/40", dot: "bg-violet-400" },

  // ── Content ─────────────────────────────────────────────────────────────────
  "Reading":       { badge: "bg-teal-500/15 text-teal-400 border-teal-500/30",      chip: "bg-teal-500/20 text-teal-300 border-teal-500/40",       dot: "bg-teal-400" },
  "General":       { badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",      chip: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",       dot: "bg-zinc-400" },
};

const FALLBACK: CategoryColor = {
  badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  chip:  "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  dot:   "bg-zinc-400",
};

export function getCategoryColor(category: string): CategoryColor {
  const key = Object.keys(CATEGORY_COLORS).find(
    (k) => k.toLowerCase() === category.trim().toLowerCase()
  );
  return key ? CATEGORY_COLORS[key] : FALLBACK;
}
