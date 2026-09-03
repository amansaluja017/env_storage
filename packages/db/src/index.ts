import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as postgresSchema from './schema/postgres.js';
import * as sqliteSchema from './schema/sqlite.js';

export * from './schema/postgres.js';
export * from './schema/sqlite.js';
export { eq, and, or, sql } from 'drizzle-orm';

// Postgres initialization for API (Auth, Workspaces & Teams)
const pgConnectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tubo_db';
export const pgPool = new Pool({
  connectionString: pgConnectionString,
  connectionTimeoutMillis: 3000,
});

export const pgDb: NodePgDatabase<typeof postgresSchema> = drizzlePg(pgPool, { schema: postgresSchema });
