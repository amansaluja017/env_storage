import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import * as postgresSchema from './schema/postgres.js';
import * as sqliteSchema from './schema/sqlite.js';

export * from './schema/postgres.js';
export * from './schema/sqlite.js';

// SQLite initialization for Env storage
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const sqlitePath = process.env.SQLITE_DB_PATH || path.join(dbDir, 'tubo_envs.db');
const sqliteConnection = new Database(sqlitePath);

// Initialize SQLite table manually if needed
sqliteConnection.exec(`
  CREATE TABLE IF NOT EXISTS envs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'development',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    is_secret INTEGER NOT NULL DEFAULT 1,
    comment TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export const sqliteDb: BetterSQLite3Database<typeof sqliteSchema> = drizzleSqlite(sqliteConnection, { schema: sqliteSchema });

// Postgres initialization for Auth, Workspaces & Teams
const pgConnectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tubo_db';
export const pgPool = new Pool({
  connectionString: pgConnectionString,
  connectionTimeoutMillis: 3000,
});

export const pgDb: NodePgDatabase<typeof postgresSchema> = drizzlePg(pgPool, { schema: postgresSchema });
