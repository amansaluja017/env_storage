import { defineConfig } from 'drizzle-kit';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from apps/api/.env, .env, or root .env
dotenv.config({ path: path.resolve(__dirname, '../../apps/api/.env') });
dotenv.config({ path: path.resolve(__dirname, './.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: './src/schema/postgres.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tubo_db',
  },
});
