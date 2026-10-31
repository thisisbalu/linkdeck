import * as fs from "fs";
import * as path from "path";

/**
 * Read and parse a JSON file. Returns the parsed value or null if the file
 * does not exist.
 */
export function readJSON<T = unknown>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Serialize data as JSON and write to filePath atomically: the content is
 * written to a temp file in the same directory and then renamed over the
 * target, so a crash mid-write never leaves a truncated file behind.
 */
export function writeJSON(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Ensure a directory exists, creating it (and any parents) if needed.
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
