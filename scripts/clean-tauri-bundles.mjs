import { rm } from "node:fs/promises";
import { join } from "node:path";

const bundleRoot = join("src-tauri", "target", "release", "bundle");
const targets = process.argv.slice(2);
const dirs = targets.length > 0 ? targets : ["macos", "dmg", "nsis", "app"];

await Promise.all(
  dirs.map(async (dir) => {
    const path = join(bundleRoot, dir);
    await rm(path, { recursive: true, force: true });
    console.log(`cleaned ${path}`);
  }),
);
