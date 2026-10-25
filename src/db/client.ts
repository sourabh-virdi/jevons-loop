import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getEnv } from "@/config/env";
import * as schema from "@/db/schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

let sqlite: Database.Database | undefined;
let db: AppDatabase | undefined;

const MIGRATION = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  split TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  thresholds_json TEXT NOT NULL,
  model_ids_json TEXT NOT NULL,
  git_sha TEXT NOT NULL,
  status TEXT NOT NULL,
  metrics_json TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  cache_hit_rate REAL,
  error TEXT
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  domain_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  input_text TEXT NOT NULL,
  output_text TEXT,
  outcome TEXT,
  latency_ms REAL,
  cost_usd REAL,
  created_at TEXT NOT NULL,
  trace_json TEXT
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  run_id TEXT,
  domain_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  checkpoint TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  primary_json TEXT NOT NULL,
  fallback_json TEXT,
  escalated INTEGER NOT NULL,
  escalation_reason TEXT,
  outcome TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  disagreement INTEGER NOT NULL DEFAULT 0,
  state_preview TEXT,
  thresholds_json TEXT,
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS decisions_filter ON decisions (domain_id, checkpoint, escalated, disagreement);
CREATE TABLE IF NOT EXISTS benchmarks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  checkpoint TEXT,
  value_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS thresholds (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  checkpoint TEXT NOT NULL,
  question TEXT NOT NULL,
  value REAL NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sweeps (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  checkpoint TEXT NOT NULL,
  split TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_cache (
  hash TEXT PRIMARY KEY,
  engine TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function resolveDatabasePath(url = getEnv().DATABASE_URL): string | ":memory:" {
  if (url === ":memory:" || url === "file::memory:") return ":memory:";
  const raw = url.startsWith("file:") ? url.slice("file:".length) : url;
  return isAbsolute(raw) ? raw : resolve(raw);
}

export function getSqlite(): Database.Database {
  if (sqlite) return sqlite;
  const path = resolveDatabasePath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(MIGRATION);
  return sqlite;
}

export function getDb(): AppDatabase {
  if (!db) db = drizzle(getSqlite(), { schema });
  return db;
}

export function resetDbForTests(): void {
  sqlite?.close();
  sqlite = undefined;
  db = undefined;
}
