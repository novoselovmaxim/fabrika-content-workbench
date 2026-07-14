import path from "path";
import fs from "fs";
import { INSTALL_DIR } from "../paths.js";

const GITHUB_REPO = "novoselovmaxim/fabrika-content-workbench";
const VPS_BASE = "https://fabric.maxnov.ru/downloads";

export function getCurrentVersion(): string {
  try {
    return fs.readFileSync(path.join(INSTALL_DIR, "version.txt"), "utf-8").trim();
  } catch {
    return "0.0.0";
  }
}

function getPlatformDownloadUrl(version: string): string {
  const plat = process.platform;  // win32 | darwin
  const arch = process.arch;      // x64 | arm64
  if (plat === "win32")
    return `${VPS_BASE}/Fabrika.Content.Setup.${version}.exe`;
  if (arch === "arm64")
    return `${VPS_BASE}/Fabrika.Content-${version}-arm64.dmg`;
  return `${VPS_BASE}/Fabrika.Content-${version}-x64.dmg`;
}

export async function checkForUpdates(): Promise<{
  hasUpdate: boolean;
  latest: string;
  current: string;
  releaseUrl: string;
  downloadUrl: string;
}> {
  const current = getCurrentVersion();
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { "User-Agent": "FabrikaContent" } },
    );
    if (!resp.ok)
      return { hasUpdate: false, latest: current, current, releaseUrl: "", downloadUrl: "" };
    const data = await resp.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    const hasUpdate = compareVersions(latest, current) > 0;
    const downloadUrl = getPlatformDownloadUrl(latest);
    return {
      hasUpdate,
      latest,
      current,
      releaseUrl: `https://fabric.maxnov.ru`,
      downloadUrl,
    };
  } catch {
    return { hasUpdate: false, latest: current, current, releaseUrl: "", downloadUrl: "" };
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
