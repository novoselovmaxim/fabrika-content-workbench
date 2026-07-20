import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { PATHS, initDataDirs } from "./paths.js";

initDataDirs();

const sqlite: Database.Database = new Database(PATHS.db);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };

const isDev = !process.env.PKG_EXECPATH && !process.env.ELECTRON_APP && !process.env.NODE_ENV;

export function runMigrations(): void {
  if (isDev) {
    console.log("✓ Dev mode — migrations managed by drizzle-kit push");
    return;
  }

  try {
    migrate(db, { migrationsFolder: PATHS.migrations });
    console.log("✓ Migrations applied");
  } catch (err) {
    console.warn("⚠ Migration non-fatal:", String(err));
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS connected_platforms (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      identifier TEXT NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT (current_timestamp)
    )
  `);

  try {
    sqlite.exec("ALTER TABLE license ADD COLUMN trial_started_at TEXT");
    console.log("✓ Added trial_started_at column");
  } catch {
    // column already exists
  }

  // Migration 0002 tables (fallback if drizzle migrate didn't run)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS policy_rules (
      id text PRIMARY KEY NOT NULL,
      project_id text,
      code text NOT NULL,
      description text NOT NULL,
      pattern text,
      severity text DEFAULT 'warning',
      enabled integer DEFAULT 1,
      created_at text DEFAULT (current_timestamp)
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS brand_facts (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      category text NOT NULL,
      source_type text NOT NULL,
      source_ref text,
      fact_text text NOT NULL,
      confidence real DEFAULT 1,
      validated integer DEFAULT 0,
      language text DEFAULT 'ru',
      canonical_fact_id text,
      created_at text DEFAULT (current_timestamp),
      updated_at text DEFAULT (current_timestamp)
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS analytics_insights (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      insight_type text NOT NULL,
      payload text NOT NULL,
      generated_at text DEFAULT (current_timestamp)
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS review_events (
      id text PRIMARY KEY NOT NULL,
      post_item_id text NOT NULL,
      actor_id text,
      actor_name text,
      event_type text NOT NULL,
      payload text,
      created_at text DEFAULT (current_timestamp)
    )
  `);

  // Migration 0003 — compliance tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS compliance_rules (
      id text PRIMARY KEY NOT NULL,
      rule_id text NOT NULL UNIQUE,
      category text NOT NULL,
      article text NOT NULL,
      title text NOT NULL,
      description text NOT NULL,
      severity text DEFAULT 'medium',
      enabled integer DEFAULT 1,
      platform_overrides text,
      created_at text DEFAULT (current_timestamp),
      updated_at text DEFAULT (current_timestamp)
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS compliance_checks (
      id text PRIMARY KEY NOT NULL,
      draft_id text,
      post_item_id text,
      platform text,
      status text DEFAULT 'pending',
      risk_score real,
      results_json text,
      checked_at text DEFAULT (current_timestamp)
    )
  `);

  // ALTER TABLE from migration 0002 (wrapped for idempotency)
  for (const stmt of [
    "ALTER TABLE draft_versions ADD COLUMN used_brand_facts text",
    "ALTER TABLE draft_versions ADD COLUMN risk_score real",
    "ALTER TABLE draft_versions ADD COLUMN risk_tags text",
    "ALTER TABLE draft_versions ADD COLUMN explanation text",
    "ALTER TABLE draft_versions ADD COLUMN language text DEFAULT 'ru'",
    "ALTER TABLE post_items ADD COLUMN review_status text DEFAULT 'none'",
    "ALTER TABLE post_items ADD COLUMN last_reviewed_by text",
    "ALTER TABLE post_items ADD COLUMN last_reviewed_at text",
    "ALTER TABLE projects ADD COLUMN primary_language text DEFAULT 'ru'",
    "ALTER TABLE projects ADD COLUMN supported_languages text",
    "ALTER TABLE post_items ADD COLUMN post_type text",
    "ALTER TABLE post_items ADD COLUMN age_rating text",
    "ALTER TABLE post_items ADD COLUMN is_advertising_marked integer DEFAULT 0",
    "ALTER TABLE post_items ADD COLUMN advertiser_info text",
    "ALTER TABLE post_items ADD COLUMN ord_token text",
    "ALTER TABLE compliance_rules ADD COLUMN rule_type text DEFAULT 'text'",
    "ALTER TABLE compliance_rules ADD COLUMN applies_to text",
    "ALTER TABLE platforms ADD COLUMN account_handle text",
  ]) {
    try { sqlite.exec(stmt); } catch {}
  }

  const existingVkKey = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("vk_service_key") as any;
  if (!existingVkKey) {
    sqlite.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("vk_service_key", "196b7984196b7984196b7984ab1a2969bf1196b196b7984732f9ecac093a3543146dc74");
  }

  console.log("✓ Database ready");
}
