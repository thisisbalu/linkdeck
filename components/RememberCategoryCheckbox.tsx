"use client";

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** True when the user picked a new, non-General category for a site we can identify. */
export function shouldOfferRemember(url: string, originalCategory: string, category: string): boolean {
  const next = category.trim();
  return !!hostOf(url) && !!next && next !== "General" && next !== originalCategory;
}

export async function saveCategoryRule(url: string, category: string): Promise<void> {
  await fetch("/api/category-rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, category: category.trim() }),
  }).catch(() => {});
}

export function RememberCategoryCheckbox({
  url, category, checked, onChange,
}: {
  url: string;
  category: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-[11px] cursor-pointer select-none" style={{ color: "var(--app-text-muted)" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-current" />
      <span>
        Always file bookmarks from <strong>{hostOf(url)}</strong> under <strong>{category.trim()}</strong>
      </span>
    </label>
  );
}
