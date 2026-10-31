import { readJSON, writeJSON } from "./fs-store";
import { backupIfDue } from "./backup";
import { withLock } from "./lock";
import { backupsDir, categoryRulesFile } from "./paths";

/** Site → category, e.g. { "figma.com": "Design" }. Hosts are stored without "www.". */
export type CategoryRules = Record<string, string>;

export function ruleHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function lookupRule(rules: CategoryRules, url: string): string | undefined {
  const host = ruleHost(url);
  return host && Object.prototype.hasOwnProperty.call(rules, host) ? rules[host] : undefined;
}

export async function readCategoryRules(): Promise<CategoryRules> {
  return (await readJSON<CategoryRules>(categoryRulesFile())) ?? {};
}

async function writeRules(rules: CategoryRules): Promise<void> {
  try {
    backupIfDue(categoryRulesFile(), backupsDir(), { prefix: "category-rules" });
  } catch (err) {
    console.warn("category rules backup failed:", err);
  }
  await writeJSON(categoryRulesFile(), rules);
}

/** Replaces all site rules (used by restore). Always snapshots the current file first. */
export function replaceCategoryRules(rules: CategoryRules): Promise<string | null> {
  return withLock("category-rules", async () => {
    const safety = backupIfDue(categoryRulesFile(), backupsDir(), { prefix: "category-rules", intervalMs: 0 });
    await writeJSON(categoryRulesFile(), rules);
    return safety;
  });
}

/** Read-modify-write of all rules under the lock, with a safety backup first. */
export function transformCategoryRules(fn: (current: CategoryRules) => CategoryRules): Promise<CategoryRules> {
  return withLock("category-rules", async () => {
    const next = fn(await readCategoryRules());
    backupIfDue(categoryRulesFile(), backupsDir(), { prefix: "category-rules", intervalMs: 0 });
    await writeJSON(categoryRulesFile(), next);
    return next;
  });
}

export function setCategoryRules(entries: { host: string; category: string }[]): Promise<CategoryRules> {
  return withLock("category-rules", async () => {
    const rules = await readCategoryRules();
    for (const { host, category } of entries) rules[host] = category;
    await writeRules(rules);
    return rules;
  });
}

export function deleteCategoryRule(host: string): Promise<CategoryRules> {
  return withLock("category-rules", async () => {
    const rules = await readCategoryRules();
    delete rules[host];
    await writeRules(rules);
    return rules;
  });
}
