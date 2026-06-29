import os from "os";
import path from "path";
import fs from "fs";

// Dev: __dirname = .../server/src  (tsx)
// Prod (node dist): __dirname = .../server/dist
// Prod (pkg binary): __dirname = /Applications/FabrikaContent
const isDev = __dirname.endsWith(path.sep + "src");
const isPkg = !__dirname.includes("server");

export const INSTALL_DIR = isPkg
  ? __dirname
  : path.resolve(__dirname, isDev ? "../.." : "../../..");

export const DATA_DIR = path.join(os.homedir(), "FabrikaContent");

export const PATHS = {
  db: isDev
    ? path.resolve(__dirname, "../../database/fabrika.db")
    : path.join(DATA_DIR, "db", "workbench.db"),
  uploads: isDev
    ? path.resolve(__dirname, "../assets/uploads")
    : path.join(DATA_DIR, "assets", "uploads"),
  generated: isDev
    ? path.resolve(__dirname, "../assets/generated")
    : path.join(DATA_DIR, "assets", "generated"),
  knowledge: isDev
    ? path.resolve(__dirname, "../assets/knowledge")
    : path.join(DATA_DIR, "assets", "knowledge"),
  logs: path.join(DATA_DIR, "logs"),
  config: path.join(DATA_DIR, "config"),
  licenseFile: path.join(DATA_DIR, "config", "license.json"),
  frontend: path.join(INSTALL_DIR, "app"),
  migrations: isDev
    ? path.resolve(__dirname, "../../database/migrations")
    : path.join(INSTALL_DIR, "migrations"),
};

export function initDataDirs(): void {
  for (const dir of [
    path.join(DATA_DIR, "db"),
    PATHS.uploads,
    PATHS.generated,
    PATHS.knowledge,
    PATHS.logs,
    PATHS.config,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
