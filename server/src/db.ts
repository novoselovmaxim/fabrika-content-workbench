import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { PATHS, initDataDirs } from "./paths.js";

initDataDirs();

const sqlite: Database.Database = new Database(PATHS.db);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Seed default VK service key if not set
const existingVkKey = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("vk_service_key") as any;
if (!existingVkKey) {
  sqlite.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("vk_service_key", "196b7984196b7984196b7984ab1a2969bf1196b196b7984732f9ecac093a3543146dc74");
}

export const db = drizzle(sqlite, { schema });
export { sqlite };

// В dev режиме миграции не нужны — drizzle-kit push синхронизирует схему
const isDev = !process.env.PKG_EXECPATH && !process.env.ELECTRON_APP && !process.env.NODE_ENV;

export function runMigrations(): void {
  if (isDev) {
    console.log("✓ Dev mode — migrations managed by drizzle-kit push");
    return;
  }
  migrate(db, { migrationsFolder: PATHS.migrations });
  console.log("✓ Migrations applied");
}
