import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import * as postgresSchema from './schema/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../apps/api/.env') });
dotenv.config({ path: path.resolve(__dirname, '../../apps/api/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

export * from './schema/postgres.js';
export * as sqliteSchema from './schema/sqlite.js';
export {
  folders as sqliteFolders,
  envs as sqliteEnvs,
} from './schema/sqlite.js';
export { eq, and, or, sql, gt, isNull, lt, desc, asc, like, ilike, inArray, notInArray } from 'drizzle-orm';

// Postgres initialization for API (Auth, Workspaces & Teams)
const pgConnectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tubo_db';

const isRemote =
  pgConnectionString.includes('neon.tech') ||
  pgConnectionString.includes('supabase.co') ||
  pgConnectionString.includes('aws.') ||
  pgConnectionString.includes('sslmode=require');

const poolConfig: PoolConfig = {
  connectionString: pgConnectionString,
  // Generous 30s timeout to allow serverless Postgres (Neon) to cold start without timing out
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  max: 20,
  ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
};

export const pgPool = new Pool(poolConfig);

pgPool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL pool client:', err);
});

export const pgDb: NodePgDatabase<typeof postgresSchema> = drizzlePg(pgPool, { schema: postgresSchema });
