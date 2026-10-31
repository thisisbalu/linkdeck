import fs from "fs";
import os from "os";
import path from "path";

// Never let tests touch the real project: scratch project root (config,
// .linkdeck/ locks + machine id) and a scratch data folder.
process.env.LINKDECK_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "linkdeck-test-root-"));
process.env.LINKDECK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "linkdeck-test-data-"));
