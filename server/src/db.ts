import Database from "better-sqlite3";
import * as schema from "./schema.js";
import { PATHS, initDataDirs } from "./paths.js";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

const { drizzle } = require("drizzle-orm/better-sqlite3/index.cjs") as {
  drizzle: (...args: any[]) => BetterSQLite3Database<typeof schema>;
};
const { migrate } = require("drizzle-orm/better-sqlite3/migrator.cjs") as {
  migrate: (db: any, config: { migrationsFolder: string }) => void;
};

initDataDirs();

const sqlite: Database.Database = new Database(PATHS.db);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };

// В dev режиме миграции не нужны — drizzle-kit push синхронизирует схему
const isDev = !process.env.PKG_EXECPATH && !process.env.NODE_ENV;

export function runMigrations(): void {
  if (isDev) {
    console.log("✓ Dev mode — migrations managed by drizzle-kit push");
    return;
  }
  migrate(db, { migrationsFolder: PATHS.migrations });
  console.log("✓ Migrations applied");
}
