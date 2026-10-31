export type Bookmark = {
  id: string;          // crypto.randomUUID()
  url: string;
  title: string;       // AI-inferred or from page <title>
  description: string; // AI-generated short description
  category: string;    // AI-inferred (e.g. "DevOps", "AI/ML", "Frontend")
  tags: string[];      // AI-inferred tags
  favicon: string;     // local path /favicons/<domain>.png
  addedAt: string;     // ISO date string
  pinned: boolean;     // pinned to top
  sortOrder?: number;  // manual drag-and-drop order (lower = earlier)
  visitCount?: number;    // times opened from Linkdeck
  lastVisitedAt?: string; // ISO date of the last open from Linkdeck
  chromeVisitCount?: number;  // visits in Chrome history (last 90 days), summed across Macs
  lastChromeVisitAt?: string; // ISO date of the latest such visit on any Mac
  /** Per-Mac Chrome usage (keyed by machine id) — each Mac's extension reports its own history. */
  chromeUsage?: Record<string, ChromeMachineUsage>;
};

export type ChromeMachineUsage = { visits: number; lastVisitAt?: string; machine?: string };
