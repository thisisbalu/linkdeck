import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { localStateDir } from "./paths";

export type MachineInfo = { id: string; name: string };

let cached: MachineInfo | null = null;

/**
 * A stable id for this Mac, stored in the machine-local .linkdeck/ folder
 * (never synced), so usage from several Macs sharing one data folder can be
 * kept apart and added up.
 */
export function thisMachine(): MachineInfo {
  if (cached) return cached;
  const file = path.join(localStateDir(), "machine.json");
  const name = os.hostname().replace(/\.local$/i, "");
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (typeof saved?.id === "string" && saved.id) {
      cached = { id: saved.id, name: typeof saved.name === "string" && saved.name ? saved.name : name };
      return cached;
    }
  } catch { /* first run */ }
  cached = { id: crypto.randomUUID(), name };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cached, null, 2) + "\n");
  return cached;
}
