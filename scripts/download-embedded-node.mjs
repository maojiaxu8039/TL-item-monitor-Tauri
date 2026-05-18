/**
 * 下载对应平台的官方 Node.js 二进制并复制到 Tauri resources 目录。
 * 打包进应用后用户无需额外安装 Node.js。
 *
 * macOS: 下载官方 tar.gz 提取 bin/node（~85MB，静态链接）
 * Windows: 直接下载 win-x64/node.exe（~50MB）
 * Linux: 下载官方 tar.gz 提取 bin/node
 */
import { createWriteStream, existsSync, mkdirSync, copyFileSync, chmodSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = join(__dirname, "..", "src-tauri", "resources");

// LTS 版本，与 CI 保持一致
const NODE_VERSION = "20.19.0";

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function download(url, dest) {
  console.log(`[embedded-node] Downloading ${url}...`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const fileStream = createWriteStream(dest);
  await pipeline(resp.body, fileStream);
  console.log(`[embedded-node] Saved to ${dest}`);
}

async function main() {
  ensureDir(RESOURCES_DIR);
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-${arch === "arm64" ? "arm64" : "x64"}.tar.gz`;
    const tarPath = join(RESOURCES_DIR, "node.tar.gz");
    const dest = join(RESOURCES_DIR, "node");

    if (existsSync(dest)) {
      console.log(`[embedded-node] ${dest} already exists, skipping.`);
      return;
    }

    await download(url, tarPath);
    console.log("[embedded-node] Extracting tar.gz...");
    const extractDir = join(RESOURCES_DIR, "node-tmp");
    ensureDir(extractDir);
    execSync(`tar -xzf "${tarPath}" -C "${extractDir}" --strip-components=1`);
    copyFileSync(join(extractDir, "bin", "node"), dest);
    chmodSync(dest, 0o755);
    rmSync(extractDir, { recursive: true, force: true });
    rmSync(tarPath, { force: true });
    console.log(`[embedded-node] macOS node ready: ${dest}`);
  } else if (platform === "win32") {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;
    const dest = join(RESOURCES_DIR, "node.exe");

    if (existsSync(dest)) {
      console.log(`[embedded-node] ${dest} already exists, skipping.`);
      return;
    }

    await download(url, dest);
    console.log(`[embedded-node] Windows node.exe ready: ${dest}`);
  } else {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch === "arm64" ? "arm64" : "x64"}.tar.xz`;
    const tarPath = join(RESOURCES_DIR, "node.tar.xz");
    const dest = join(RESOURCES_DIR, "node");

    if (existsSync(dest)) {
      console.log(`[embedded-node] ${dest} already exists, skipping.`);
      return;
    }

    await download(url, tarPath);
    console.log("[embedded-node] Extracting tar.xz...");
    const extractDir = join(RESOURCES_DIR, "node-tmp");
    ensureDir(extractDir);
    execSync(`tar -xJf "${tarPath}" -C "${extractDir}" --strip-components=1`);
    copyFileSync(join(extractDir, "bin", "node"), dest);
    chmodSync(dest, 0o755);
    rmSync(extractDir, { recursive: true, force: true });
    rmSync(tarPath, { force: true });
    console.log(`[embedded-node] Linux node ready: ${dest}`);
  }
}

main().catch((err) => {
  console.error("[embedded-node] Error:", err.message);
  process.exit(1);
});
