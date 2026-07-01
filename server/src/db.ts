import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { PATHS, initDataDirs } from "./paths.js";

initDataDirs();

const sqlite: Database.Database = new Database(PATHS.db);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS connected_platforms (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    identifier TEXT NOT NULL,
    label TEXT,
    created_at TEXT DEFAULT (current_timestamp)
  )
`);

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
