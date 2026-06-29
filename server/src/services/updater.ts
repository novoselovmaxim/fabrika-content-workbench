import path from "path";
import fs from "fs";
import { INSTALL_DIR } from "../paths.js";

const GITHUB_REPO = "novoselovmaxim/fabrika-content-workbench";

export function getCurrentVersion(): string {
  try {
    return fs.readFileSync(path.join(INSTALL_DIR, "version.txt"), "utf-8").trim();
  } catch {
    return "0.0.0";
  }
}

export async function checkForUpdates(): Promise<{
  hasUpdate: boolean;
  latest: string;
  current: string;
  releaseUrl: string;
}> {
  const current = getCurrentVersion();
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { "User-Agent": "FabrikaContent" } },
    );
    if (!resp.ok)
      return { hasUpdate: false, latest: current, current, releaseUrl: "" };
    const data = await resp.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    const hasUpdate = compareVersions(latest, current) > 0;
    const releaseUrl =
      data.html_url ||
      `https://github.com/${GITHUB_REPO}/releases/latest`;
    return { hasUpdate, latest, current, releaseUrl };
  } catch {
    return { hasUpdate: false, latest: current, current, releaseUrl: "" };
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
