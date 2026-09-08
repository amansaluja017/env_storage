import * as SQLite from 'expo-sqlite';
import { drizzle, ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { eq, and, or, like, desc, asc, sql, isNull, notInArray, inArray } from 'drizzle-orm';
import JSZip from 'jszip';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiClient } from '../utils/apiClient';
import {
  encryptEnvValue,
  decryptEnvValue,
  isEncryptedEnvValue,
} from '../utils/vaultCrypto';

export { encryptEnvValue, decryptEnvValue, isEncryptedEnvValue };

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  teamId: text('team_id').notNull(),
  environment: text('environment').$type<'development' | 'staging' | 'production'>().default('development').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').default('Unknown').notNull(),
  createdById: text('created_by_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  syncStatus: text('sync_status').$type<'synced' | 'pending_create' | 'pending_update' | 'pending_delete'>().default('synced').notNull(),
});

export const envs = sqliteTable('envs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  teamId: text('team_id').notNull(),
  environment: text('environment').$type<'development' | 'staging' | 'production'>().default('development').notNull(),
  folderId: text('folder_id'),
  key: text('key').notNull(),
  value: text('value').notNull(),
  isSecret: integer('is_secret', { mode: 'boolean' }).default(true).notNull(),
  comment: text('comment'),
  createdBy: text('created_by').default('Unknown').notNull(),
  createdById: text('created_by_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  syncStatus: text('sync_status').$type<'synced' | 'pending_create' | 'pending_update' | 'pending_delete'>().default('synced').notNull(),
});

export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').$type<'folder' | 'env'>().notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').$type<'create' | 'update' | 'delete' | 'bulk_import'>().notNull(),
  payload: text('payload').notNull(),
  status: text('status').$type<'pending' | 'syncing' | 'failed'>().default('pending').notNull(),
  retryCount: integer('retry_count').default(0).notNull(),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export interface FolderItem {
  id: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  name: string;
  description?: string;
  createdBy: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  envCount?: number;
  syncStatus?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete';
}

export interface EnvItem {
  id: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  folderId?: string | null;
  folderName?: string;
  key: string;
  value: string;
  isSecret: boolean;
  comment?: string;
  createdBy: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete';
}

export interface SyncQueueItem {
  id: string;
  entityType: 'folder' | 'env';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'bulk_import';
  payload: string;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DB_NAME = 'mobile_env_vault.db';

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let expoDbInstance: SQLite.SQLiteDatabase | null = null;
let drizzleDb: ExpoSQLiteDatabase<{
  folders: typeof folders;
  envs: typeof envs;
  syncQueue: typeof syncQueue;
}> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize persistent SQLite Database & Drizzle ORM in Mobile
 */
export async function initMobileSqlite(): Promise<void> {
  if (expoDbInstance && drizzleDb) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      expoDbInstance = db;

      // Enable WAL mode for optimal performance and concurrency
      try {
        await db.execAsync('PRAGMA journal_mode = WAL;');
      } catch {
        // Safe to continue if runtime restricts journal_mode
      }

      // 1. Create tables if they do not exist
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_id TEXT NOT NULL,
          team_id TEXT NOT NULL,
          environment TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_by TEXT NOT NULL DEFAULT 'Unknown',
          created_by_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          sync_status TEXT NOT NULL DEFAULT 'synced'
        );

        CREATE TABLE IF NOT EXISTS envs (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_id TEXT NOT NULL,
          team_id TEXT NOT NULL,
          environment TEXT NOT NULL,
          folder_id TEXT,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          is_secret INTEGER NOT NULL DEFAULT 1,
          comment TEXT,
          created_by TEXT NOT NULL DEFAULT 'Unknown',
          created_by_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          sync_status TEXT NOT NULL DEFAULT 'synced'
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // 2. Safe column migrations: check existing columns before creating indexes
      try {
        const envCols: any[] = await db.getAllAsync('PRAGMA table_info(envs);');
        const colNames = new Set((envCols || []).map((c: any) => c.name));
        if (!colNames.has('folder_id')) {
          await db.execAsync('ALTER TABLE envs ADD COLUMN folder_id TEXT;');
        }
        if (!colNames.has('created_by')) {
          await db.execAsync("ALTER TABLE envs ADD COLUMN created_by TEXT NOT NULL DEFAULT 'Unknown';");
        }
        if (!colNames.has('created_by_id')) {
          await db.execAsync('ALTER TABLE envs ADD COLUMN created_by_id TEXT;');
        }
        if (!colNames.has('is_secret')) {
          await db.execAsync('ALTER TABLE envs ADD COLUMN is_secret INTEGER NOT NULL DEFAULT 1;');
        }
        if (!colNames.has('comment')) {
          await db.execAsync('ALTER TABLE envs ADD COLUMN comment TEXT;');
        }
        if (!colNames.has('sync_status')) {
          await db.execAsync("ALTER TABLE envs ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced';");
        }
      } catch (migErr) {
        console.log('Notice on envs column migration:', migErr);
      }

      try {
        const folderCols: any[] = await db.getAllAsync('PRAGMA table_info(folders);');
        const folderColNames = new Set((folderCols || []).map((c: any) => c.name));
        if (!folderColNames.has('created_by')) {
          await db.execAsync("ALTER TABLE folders ADD COLUMN created_by TEXT NOT NULL DEFAULT 'Unknown';");
        }
        if (!folderColNames.has('created_by_id')) {
          await db.execAsync('ALTER TABLE folders ADD COLUMN created_by_id TEXT;');
        }
        if (!folderColNames.has('description')) {
          await db.execAsync('ALTER TABLE folders ADD COLUMN description TEXT;');
        }
        if (!folderColNames.has('sync_status')) {
          await db.execAsync("ALTER TABLE folders ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced';");
        }
      } catch (migErr) {
        console.log('Notice on folders column migration:', migErr);
      }

      // 3. Create indexes safely now that columns are guaranteed to exist
      const indexQueries = [
        'CREATE INDEX IF NOT EXISTS idx_folders_scope ON folders (workspace_id, team_id, environment);',
        'CREATE INDEX IF NOT EXISTS idx_envs_team ON envs (workspace_id, team_id, environment);',
        'CREATE INDEX IF NOT EXISTS idx_envs_folder ON envs (folder_id);',
        'CREATE INDEX IF NOT EXISTS idx_envs_key ON envs (key);',
        'CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue (status);',
      ];
      for (const idxQuery of indexQueries) {
        try {
          await db.execAsync(idxQuery);
        } catch (idxErr) {
          console.log('Notice on index creation:', idxErr);
        }
      }

      // 4. Initialize Drizzle ORM on top of the persistent SQLite database
      drizzleDb = drizzle(db, { schema: { folders, envs, syncQueue } });

      // 5. Ensure any sensitive environment variables in SQLite are encrypted (never stored dry)
      try {
        const sensitiveRows = await drizzleDb
          .select({ id: envs.id, value: envs.value })
          .from(envs)
          .where(and(eq(envs.isSecret, true), sql`value NOT LIKE 'enc:v1:%'`));

        for (const row of sensitiveRows) {
          if (row.value && !isEncryptedEnvValue(row.value)) {
            await drizzleDb
              .update(envs)
              .set({ value: encryptEnvValue(row.value) })
              .where(eq(envs.id, row.id));
          }
        }
      } catch (err) {
        console.log('Notice on auto-encrypt sensitive envs in SQLite:', err);
      }

      // 6. Clean any leftover mock data
      try {
        await db.runAsync("DELETE FROM envs WHERE id = 'env_uqkayec4';");
      } catch {
        // ignore
      }

      // 7. Clear all SQLite tables as requested
      try {
        let cleared = false;
        if (Platform.OS !== 'web') {
          const val = await SecureStore.getItemAsync('sqlite_cleared_user_request_v1');
          cleared = val === 'true';
        }
        if (!cleared) {
          await db.execAsync(`
            DELETE FROM sync_queue;
            DELETE FROM envs;
            DELETE FROM folders;
          `);
          if (Platform.OS !== 'web') {
            await SecureStore.setItemAsync('sqlite_cleared_user_request_v1', 'true');
          }
        }
      } catch (err) {
        console.warn('Notice on clearing SQLite tables:', err);
      }
    } catch (err) {
      console.error('Error opening persistent mobile SQLite database:', err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Clear all records from all tables in persistent SQLite database
 */
export async function clearAllMobileSqliteTables(): Promise<void> {
  const { db } = await ensureDb();
  await db.execAsync(`
    DELETE FROM sync_queue;
    DELETE FROM envs;
    DELETE FROM folders;
  `);
}

/**
 * Ensure persistent database is opened and ready before executing any operation
 */
export async function ensureDb(): Promise<{
  db: SQLite.SQLiteDatabase;
  drizzle: ExpoSQLiteDatabase<{
    folders: typeof folders;
    envs: typeof envs;
    syncQueue: typeof syncQueue;
  }>;
}> {
  if (!expoDbInstance || !drizzleDb) {
    await initMobileSqlite();
  }
  if (!expoDbInstance || !drizzleDb) {
    throw new Error('Persistent SQLite database could not be initialized');
  }
  return { db: expoDbInstance, drizzle: drizzleDb };
}

/**
 * Enqueue a sync mutation in the persistent SQLite sync_queue table
 */
export async function enqueueSyncItem(params: {
  entityType: 'folder' | 'env';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'bulk_import';
  payload: any;
}): Promise<string> {
  const { drizzle } = await ensureDb();
  const id = generateUuid();
  const now = new Date().toISOString();

  await drizzle.insert(syncQueue).values({
    id,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    payload: JSON.stringify(params.payload),
    status: 'pending',
    retryCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

/**
 * Fetch all pending or failed sync mutations from SQLite sync_queue table
 */
export async function getPendingSyncQueue(limit?: number): Promise<SyncQueueItem[]> {
  const { drizzle } = await ensureDb();
  let query = drizzle
    .select()
    .from(syncQueue)
    .where(or(eq(syncQueue.status, 'pending'), eq(syncQueue.status, 'failed')))
    .orderBy(asc(syncQueue.createdAt));

  if (limit) {
    query = query.limit(limit) as any;
  }

  const rows = await query;
  return rows as SyncQueueItem[];
}

/**
 * Update the status of a sync queue item
 */
export async function updateSyncItemStatus(
  id: string,
  status: 'pending' | 'syncing' | 'failed',
  lastError?: string
): Promise<void> {
  const { drizzle } = await ensureDb();
  const now = new Date().toISOString();

  if (status === 'failed' || (status === 'pending' && lastError)) {
    await drizzle
      .update(syncQueue)
      .set({
        status,
        lastError: lastError || (status === 'failed' ? 'Unknown sync error' : null),
        retryCount: sql`retry_count + 1`,
        updatedAt: now,
      })
      .where(eq(syncQueue.id, id));
  } else {
    await drizzle
      .update(syncQueue)
      .set({
        status,
        updatedAt: now,
      })
      .where(eq(syncQueue.id, id));
  }
}

/**
 * Remove a completed item from the sync_queue
 */
export async function removeSyncItem(id: string): Promise<void> {
  const { drizzle } = await ensureDb();
  await drizzle.delete(syncQueue).where(eq(syncQueue.id, id));
}

/**
 * Mark a local entity as fully synced in SQLite
 */
export async function markEntitySynced(
  entityType: 'folder' | 'env',
  entityId: string
): Promise<void> {
  const { drizzle } = await ensureDb();
  if (entityType === 'folder') {
    await drizzle
      .update(folders)
      .set({ syncStatus: 'synced' })
      .where(eq(folders.id, entityId));
  } else {
    await drizzle
      .update(envs)
      .set({ syncStatus: 'synced' })
      .where(eq(envs.id, entityId));
  }
}

/**
 * Get count of pending sync mutations
 */
export async function getPendingSyncCount(): Promise<number> {
  const { drizzle } = await ensureDb();
  const res = await drizzle
    .select({ count: sql<number>`count(*)` })
    .from(syncQueue)
    .where(or(eq(syncQueue.status, 'pending'), eq(syncQueue.status, 'failed')));

  return Number(res[0]?.count || 0);
}

/**
 * Query all folders for a team & environment with variable counts from persistent SQLite
 */
export async function getMobileFolders(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production'
): Promise<FolderItem[]> {
  const { drizzle } = await ensureDb();

  const folderRows = await drizzle
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.workspaceId, workspaceId),
        eq(folders.teamId, teamId),
        eq(folders.environment, environment)
      )
    )
    .orderBy(asc(folders.name));

  // Get count of envs per folder
  const envRows = await drizzle
    .select({
      folderId: envs.folderId,
      count: sql<number>`count(*)`,
    })
    .from(envs)
    .where(
      and(
        eq(envs.workspaceId, workspaceId),
        eq(envs.teamId, teamId),
        eq(envs.environment, environment)
      )
    )
    .groupBy(envs.folderId);

  const countMap = new Map<string, number>();
  for (const row of envRows) {
    if (row.folderId) {
      countMap.set(row.folderId, Number(row.count));
    }
  }

  return folderRows.map(f => ({
    id: f.id,
    workspaceId: f.workspaceId,
    teamId: f.teamId,
    environment: f.environment as 'development' | 'staging' | 'production',
    name: f.name,
    description: f.description || undefined,
    createdBy: f.createdBy,
    createdById: f.createdById || undefined,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    envCount: countMap.get(f.id) || 0,
  }));
}

/**
 * Query summary counts for folders, total envs, and unfiled/root envs from persistent SQLite
 */
export async function getMobileVaultStats(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production'
): Promise<{ totalEnvs: number; rootEnvs: number; folderCount: number }> {
  const { drizzle } = await ensureDb();

  const allRows = await drizzle
    .select({
      folderId: envs.folderId,
      count: sql<number>`count(*)`,
    })
    .from(envs)
    .where(
      and(
        eq(envs.workspaceId, workspaceId),
        eq(envs.teamId, teamId),
        eq(envs.environment, environment)
      )
    )
    .groupBy(envs.folderId);

  let totalEnvs = 0;
  let rootEnvs = 0;
  for (const row of allRows) {
    const c = Number(row.count) || 0;
    totalEnvs += c;
    if (!row.folderId) {
      rootEnvs += c;
    }
  }

  const fCountRes = await drizzle
    .select({ count: sql<number>`count(*)` })
    .from(folders)
    .where(
      and(
        eq(folders.workspaceId, workspaceId),
        eq(folders.teamId, teamId),
        eq(folders.environment, environment)
      )
    );
  const folderCount = Number(fCountRes[0]?.count) || 0;

  return { totalEnvs, rootEnvs, folderCount };
}

/**
 * Create a new folder in persistent SQLite
 */
export async function createMobileFolder(data: {
  id?: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  name: string;
  description?: string;
  createdBy?: string;
  createdById?: string;
}): Promise<FolderItem> {
  const { drizzle } = await ensureDb();
  const id = data.id || generateUuid();
  const now = new Date().toISOString();
  const createdBy = data.createdBy || 'Mobile User';
  const trimmedName = data.name.trim();

  await drizzle
    .insert(folders)
    .values({
      id,
      workspaceId: data.workspaceId,
      teamId: data.teamId,
      environment: data.environment,
      name: trimmedName,
      description: data.description?.trim() || null,
      createdBy,
      createdById: data.createdById || null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending_create',
    })
    .onConflictDoUpdate({
      target: folders.id,
      set: {
        name: trimmedName,
        description: data.description?.trim() || null,
        updatedAt: now,
        syncStatus: 'pending_update',
      },
    });

  return {
    id,
    workspaceId: data.workspaceId,
    teamId: data.teamId,
    environment: data.environment,
    name: trimmedName,
    description: data.description?.trim(),
    createdBy,
    createdById: data.createdById,
    createdAt: now,
    updatedAt: now,
    envCount: 0,
    syncStatus: 'pending_create',
  };
}

/**
 * Update an existing folder in persistent SQLite
 */
export async function updateMobileFolder(
  folderId: string,
  name: string,
  description?: string
): Promise<void> {
  const { drizzle } = await ensureDb();
  const now = new Date().toISOString();
  const trimmedName = name.trim();

  await drizzle
    .update(folders)
    .set({
      name: trimmedName,
      description: description?.trim() || null,
      updatedAt: now,
      syncStatus: 'pending_update',
    })
    .where(eq(folders.id, folderId));
}

/**
 * Delete a folder from persistent SQLite
 * @param deleteEnvs If true, deletes all env variables inside the folder. If false, unlinks them to root.
 */
export async function deleteMobileFolder(folderId: string, deleteEnvs: boolean = false): Promise<boolean> {
  const { drizzle } = await ensureDb();

  if (deleteEnvs) {
    await drizzle.delete(envs).where(eq(envs.folderId, folderId));
  } else {
    await drizzle
      .update(envs)
      .set({ folderId: null, updatedAt: new Date().toISOString() })
      .where(eq(envs.folderId, folderId));
  }
  await drizzle.delete(folders).where(eq(folders.id, folderId));
  return true;
}

/**
 * Query environment variables from persistent SQLite using Drizzle ORM
 */
export async function getMobileEnvs(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production',
  searchQuery?: string,
  folderId?: string | null | 'all'
): Promise<EnvItem[]> {
  const { drizzle } = await ensureDb();

  const conditions = [
    eq(envs.workspaceId, workspaceId),
    eq(envs.teamId, teamId),
    eq(envs.environment, environment),
  ];

  // Folder filtering
  if (folderId && folderId !== 'all') {
    if (folderId === 'root') {
      conditions.push(isNull(envs.folderId));
    } else {
      conditions.push(eq(envs.folderId, folderId));
    }
  }

  if (searchQuery && searchQuery.trim()) {
    const pattern = `%${searchQuery.trim()}%`;
    conditions.push(or(like(envs.key, pattern), like(envs.comment, pattern))!);
  }

  // Query envs
  const rows = await drizzle
    .select()
    .from(envs)
    .where(and(...conditions))
    .orderBy(asc(envs.key));

  // Get folder names map
  const allFolders = await drizzle
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(
      and(
        eq(folders.workspaceId, workspaceId),
        eq(folders.teamId, teamId),
        eq(folders.environment, environment)
      )
    );
  const folderNameMap = new Map(allFolders.map(f => [f.id, f.name]));

  return rows.map(r => ({
    id: r.id,
    workspaceId: r.workspaceId,
    teamId: r.teamId,
    environment: r.environment as 'development' | 'staging' | 'production',
    folderId: r.folderId,
    folderName: r.folderId ? folderNameMap.get(r.folderId) : undefined,
    key: r.key,
    value: r.isSecret ? decryptEnvValue(r.value) : r.value,
    isSecret: Boolean(r.isSecret),
    comment: r.comment || undefined,
    createdBy: r.createdBy,
    createdById: r.createdById || undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Upsert (Insert or Update) an environment variable into persistent SQLite using Drizzle ORM
 */
export async function upsertMobileEnv(data: {
  id?: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  folderId?: string | null;
  key: string;
  value: string;
  isSecret?: boolean;
  comment?: string;
  createdBy?: string;
  createdById?: string;
}): Promise<EnvItem> {
  const { drizzle } = await ensureDb();

  const now = new Date().toISOString();
  const createdBy = data.createdBy || 'Mobile User';
  const isSecret = data.isSecret ?? true;
  const normalizedKey = data.key.toUpperCase().trim();
  const folderId = data.folderId || null;
  // If sensitive (isSecret is true), never store dry/plain-text in SQLite — encrypt it!
  const valueToStore = isSecret ? encryptEnvValue(data.value) : data.value;

  let targetId = data.id;

  // If no ID was provided, check if key already exists in this team/environment (and folder)
  if (!targetId) {
    const existingRow = await drizzle
      .select({ id: envs.id })
      .from(envs)
      .where(
        and(
          eq(envs.workspaceId, data.workspaceId),
          eq(envs.teamId, data.teamId),
          eq(envs.environment, data.environment),
          eq(envs.key, normalizedKey),
          folderId ? eq(envs.folderId, folderId) : isNull(envs.folderId)
        )
      )
      .limit(1);

    if (existingRow.length > 0) {
      targetId = existingRow[0].id;
    }
  }

  targetId = targetId || generateUuid();

  const syncStatus = data.id ? 'pending_update' : 'pending_create';

  // Upsert using Drizzle ORM onConflictDoUpdate
  await drizzle
    .insert(envs)
    .values({
      id: targetId,
      workspaceId: data.workspaceId,
      teamId: data.teamId,
      environment: data.environment,
      folderId: folderId,
      key: normalizedKey,
      value: valueToStore,
      isSecret: isSecret,
      comment: data.comment || null,
      createdBy,
      createdById: data.createdById || null,
      createdAt: now,
      updatedAt: now,
      syncStatus,
    })
    .onConflictDoUpdate({
      target: envs.id,
      set: {
        workspaceId: data.workspaceId,
        teamId: data.teamId,
        environment: data.environment,
        folderId: folderId,
        key: normalizedKey,
        value: valueToStore,
        isSecret: isSecret,
        comment: data.comment || null,
        updatedAt: now,
        syncStatus: 'pending_update',
      },
    });

  return {
    id: targetId,
    workspaceId: data.workspaceId,
    teamId: data.teamId,
    environment: data.environment,
    folderId,
    key: normalizedKey,
    value: data.value,
    isSecret,
    comment: data.comment,
    createdBy,
    createdById: data.createdById,
    createdAt: now,
    updatedAt: now,
    syncStatus,
  };
}

/**
 * Delete an environment variable by ID from persistent SQLite using Drizzle ORM
 */
export async function deleteMobileEnv(id: string): Promise<boolean> {
  const { drizzle } = await ensureDb();
  await drizzle.delete(envs).where(eq(envs.id, id));
  return true;
}

/**
 * Bulk import raw .env contents directly into persistent SQLite via Drizzle ORM
 */
export async function bulkImportMobileEnvs(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production',
  rawDotEnvContent: string,
  createdBy: string = 'Mobile User',
  folderId?: string | null
): Promise<{ importedCount: number }> {
  const lines = rawDotEnvContent.split('\n');
  let importedCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.substring(0, eqIdx).trim().toUpperCase();
    let value = trimmed.substring(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).replace(/\\([\\n"'])/g, (_, esc) => {
        if (esc === 'n') return '\n';
        if (esc === '\\') return '\\';
        if (esc === '"') return '"';
        if (esc === "'") return "'";
        return esc;
      });
    }

    await upsertMobileEnv({
      workspaceId,
      teamId,
      environment,
      folderId,
      key,
      value,
      isSecret: true,
      comment: 'Imported in Mobile SQLite',
      createdBy,
    });
    importedCount++;
  }

  return { importedCount };
}

/**
 * Reconcile bulk-imported envs after successful API sync.
 * Removes any pending_create rows whose keys match the newly imported remote envs
 * in this scope, so they are cleanly replaced by the authoritative remote rows.
 */
export async function reconcileBulkImportedEnvs(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production',
  importedKeys: string[],
  folderId?: string | null
): Promise<void> {
  if (!importedKeys || importedKeys.length === 0) return;
  const { drizzle } = await ensureDb();

  const conditions = [
    eq(envs.workspaceId, workspaceId),
    eq(envs.teamId, teamId),
    eq(envs.environment, environment),
    inArray(envs.syncStatus, ['pending_create', 'pending_update']),
    inArray(envs.key, importedKeys),
  ];

  if (folderId !== undefined) {
    if (folderId === null) {
      conditions.push(isNull(envs.folderId));
    } else {
      conditions.push(eq(envs.folderId, folderId));
    }
  }

  await drizzle.delete(envs).where(and(...conditions));
}

/**
 * Export all environment variables for a team as a .env formatted string from persistent SQLite
 */
export async function exportMobileEnvsDotEnv(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production',
  folderId?: string | null | 'all'
): Promise<string> {
  const envsList = await getMobileEnvs(workspaceId, teamId, environment, undefined, folderId);
  return envsList
    .map(e => {
      const commentPart = e.comment ? `# ${e.comment}\n` : '';
      const escapedValue = (e.value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
      return `${commentPart}${e.key}="${escapedValue}"`;
    })
    .join('\n\n');
}

/**
 * Export environment variables from local mobile SQLite as a ZIP archive containing .env files.
 * Archive structure:
 *   - <folder_name>/.env
 *   - root/.env (if root unassigned keys exist)
 */
export async function exportMobileEnvsZip(params: {
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  folderIds?: string[] | null;
  teamName?: string;
  apiBaseUrl?: string;
}): Promise<{
  fileName: string;
  base64: string;
  folderCount: number;
  envCount: number;
}> {
  const { workspaceId, teamId, environment, folderIds, teamName, apiBaseUrl } = params;
  const teamNameSlug = (teamName || 'team')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');

  // 1. Sync remote folders & all remote envs from PostgreSQL so local SQLite has full data
  if (apiBaseUrl) {
    try {
      const [foldersRes, envsRes] = await Promise.all([
        apiClient.get(`${apiBaseUrl}/trpc/folder.list`, {
          params: {
            input: JSON.stringify({
              workspaceId,
              teamId,
              environment,
            }),
          },
        }),
        apiClient.get(`${apiBaseUrl}/trpc/env.list`, {
          params: {
            input: JSON.stringify({
              workspaceId,
              teamId,
              environment,
            }),
          },
        }),
      ]);

      const remoteFolders = foldersRes.data?.result?.data;
      if (Array.isArray(remoteFolders)) {
        await syncFoldersFromRemote(workspaceId, teamId, environment, remoteFolders);
      }

      const remoteEnvs = envsRes.data?.result?.data;
      if (Array.isArray(remoteEnvs)) {
        await syncEnvsFromRemote(workspaceId, teamId, environment, remoteEnvs);
      }
    } catch (err: any) {
      console.log('Background remote sync before export skipped (offline or network error):', err?.message || err);
    }
  }

  // 2. Fetch all folders from local SQLite
  const allFolders = await getMobileFolders(workspaceId, teamId, environment);
  const folderMap = new Map<string, FolderItem>();
  allFolders.forEach(f => folderMap.set(f.id, f));

  // Determine target folders
  let targetFolders: FolderItem[] = [];
  let includeRoot = false;

  if (!folderIds || folderIds.length === 0) {
    targetFolders = allFolders;
    includeRoot = true;
  } else {
    includeRoot = folderIds.includes('root') || folderIds.includes('unfiled') || folderIds.includes(null as any);
    targetFolders = allFolders.filter(f => folderIds.includes(f.id));
  }

  // 3. Fetch all envs from local SQLite (which now includes synced remote envs)
  const allEnvs = await getMobileEnvs(workspaceId, teamId, environment);

  // Group envs by folderId (null means root)
  const envsByFolder = new Map<string | null, EnvItem[]>();
  allEnvs.forEach(e => {
    const fId = e.folderId || null;
    if (!envsByFolder.has(fId)) {
      envsByFolder.set(fId, []);
    }
    envsByFolder.get(fId)!.push(e);
  });

  const zip = new JSZip();
  let totalExportedEnvs = 0;
  let totalExportedFolders = 0;

  const formatDotEnv = (items: EnvItem[], folderTitle: string): string => {
    const header = [
      `# ==========================================`,
      `# Env Vault Environment Export`,
      `# Team: ${teamName || teamId}`,
      `# Folder: ${folderTitle}`,
      `# Environment: ${environment}`,
      `# Exported At: ${new Date().toISOString()}`,
      `# Total Variables: ${items.length}`,
      `# ==========================================`,
      '',
    ].join('\n');

    const body = items
      .map(e => {
        const commentPart = e.comment ? `# ${e.comment}\n` : '';
        const escapedValue = (e.value ?? '')
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n');
        return `${commentPart}${e.key}="${escapedValue}"`;
      })
      .join('\n\n');

    return header + body + '\n';
  };

  // Add target folders to zip with both standard .env and visible <folder_name>.env
  for (const folder of targetFolders) {
    const folderEnvs = envsByFolder.get(folder.id) || [];
    const sanitizedName = folder.name
      .trim()
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_');
    const dotEnvContent = formatDotEnv(folderEnvs, folder.name);

    const folderZip = zip.folder(sanitizedName);
    if (folderZip) {
      // 1. Standard .env file for CLI, Docker, and developer tools
      folderZip.file('.env', dotEnvContent);
      // 2. Visible non-hidden .env file for mobile file explorers (which hide dotfiles by default)
      folderZip.file(`${sanitizedName}.env`, dotEnvContent);
    } else {
      zip.file(`${sanitizedName}/.env`, dotEnvContent);
      zip.file(`${sanitizedName}/${sanitizedName}.env`, dotEnvContent);
    }

    totalExportedFolders++;
    totalExportedEnvs += folderEnvs.length;
  }

  // Add root / unassigned envs if included
  if (includeRoot) {
    const rootEnvs = envsByFolder.get(null) || [];
    if (rootEnvs.length > 0 || (!folderIds || folderIds.length === 0)) {
      const dotEnvContent = formatDotEnv(rootEnvs, 'Root / Unfiled');
      const rootZip = zip.folder('root');
      if (rootZip) {
        rootZip.file('.env', dotEnvContent);
        rootZip.file('root.env', dotEnvContent);
      } else {
        zip.file('root/.env', dotEnvContent);
        zip.file('root/root.env', dotEnvContent);
      }
      totalExportedFolders++;
      totalExportedEnvs += rootEnvs.length;
    }
  }

  // Add a top-level manifest README.txt
  const manifestContent = [
    `==========================================`,
    `Env Vault Environment Export`,
    `==========================================`,
    `Team: ${teamName || teamId}`,
    `Environment: ${environment.toUpperCase()}`,
    `Export Date: ${new Date().toISOString()}`,
    `Folders Exported: ${totalExportedFolders}`,
    `Variables Exported: ${totalExportedEnvs}`,
    ``,
    `Contents:`,
    ...targetFolders.map(f => `  • ${f.name}/: ${(envsByFolder.get(f.id) || []).length} variables`),
    includeRoot ? `  • root/: ${(envsByFolder.get(null) || []).length} variables` : '',
    ``,
    `Note: Each folder contains:`,
    `  - .env (standard dotenv file for build tools & deployment)`,
    `  - <folder_name>.env (visible in mobile/desktop file managers that hide dotfiles by default)`,
  ].filter(Boolean).join('\n');

  zip.file('README.txt', manifestContent);

  // Name the zip file based on single vs multiple
  let fileName = `env_vault_${teamNameSlug}_${environment}_envs.zip`;
  if (folderIds && folderIds.length === 1) {
    const singleId = folderIds[0];
    const singleFolder = singleId ? folderMap.get(singleId) : null;
    const singleName = singleFolder
      ? singleFolder.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
      : 'root';
    fileName = `env_vault_${teamNameSlug}_${singleName}_${environment}.zip`;
  }

  const base64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    fileName,
    base64,
    folderCount: totalExportedFolders,
    envCount: totalExportedEnvs,
  };
}

/**
 * Download a base64 encoded ZIP archive directly to the user's device.
 * - On Web: triggers browser download directly.
 * - On Android: uses StorageAccessFramework to prompt the user to pick a folder (e.g. Downloads),
 *   and writes the file directly without opening social share sheets.
 * - On iOS: writes directly to the app document directory.
 */
export async function downloadZipToDevice(fileName: string, base64Data: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } else if (Platform.OS === 'android') {
    try {
      if (FileSystemLegacy.StorageAccessFramework) {
        const permissions = await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) {
          throw new Error('Storage access was not granted. Please select a folder like Downloads.');
        }

        const mimeType = 'application/zip';
        const nameWithoutExt = fileName.replace(/\.zip$/i, '');
        const createdFileUri = await FileSystemLegacy.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          nameWithoutExt,
          mimeType
        );

        await FileSystemLegacy.StorageAccessFramework.writeAsStringAsync(createdFileUri, base64Data, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });

        return true;
      }
    } catch (safErr: any) {
      if (
        safErr?.message?.includes('granted') ||
        safErr?.message?.includes('denied') ||
        safErr?.message?.includes('permission') ||
        safErr?.message?.includes('cancel')
      ) {
        throw safErr;
      }
      console.warn('SAF error, falling back to direct document directory:', safErr?.message || safErr);
    }

    // Fallback if SAF not supported or failed
    const fallbackPath = `${FileSystemLegacy.documentDirectory || FileSystemLegacy.cacheDirectory}${fileName}`;
    await FileSystemLegacy.writeAsStringAsync(fallbackPath, base64Data, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });
    return true;
  } else {
    // iOS: Save directly to app document directory
    const docPath = `${FileSystemLegacy.documentDirectory || FileSystemLegacy.cacheDirectory}${fileName}`;
    await FileSystemLegacy.writeAsStringAsync(docPath, base64Data, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });
    return true;
  }
}

/**
 * Backward compatibility alias for downloadZipToDevice
 */
export const saveOrShareZip = downloadZipToDevice;


/**
 * Query all raw rows from persistent SQLite using Drizzle ORM for table inspector
 */
export async function getAllMobileEnvsRaw(): Promise<any[]> {
  const { drizzle } = await ensureDb();
  return await drizzle.select().from(envs).orderBy(desc(envs.createdAt));
}

/**
 * Query all raw folders from persistent SQLite using Drizzle ORM
 */
export async function getAllMobileFoldersRaw(): Promise<any[]> {
  const { drizzle } = await ensureDb();
  return await drizzle.select().from(folders).orderBy(desc(folders.createdAt));
}

/**
 * Execute custom SQL query directly against the persistent Mobile SQLite database
 */
export async function executeMobileSqliteQuery(sqlStr: string): Promise<any[]> {
  const { db } = await ensureDb();
  return (await db.getAllAsync(sqlStr)) as any[];
}

/**
 * Get persistent Mobile SQLite database statistics
 */
export async function getMobileSqliteStats(): Promise<{
  isNative: boolean;
  dbName: string;
  totalRows: number;
  totalFolders: number;
  tables: string[];
}> {
  const { db, drizzle } = await ensureDb();
  const countRes = await drizzle.select({ count: sql<number>`count(*)` }).from(envs);
  const folderCountRes = await drizzle.select({ count: sql<number>`count(*)` }).from(folders);
  const tablesRes = (await db.getAllAsync(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
  )) as any[];

  return {
    isNative: true,
    dbName: DB_NAME,
    totalRows: countRes[0]?.count ?? 0,
    totalFolders: folderCountRes[0]?.count ?? 0,
    tables: (tablesRes || []).map((t: any) => t.name),
  };
}

/**
 * Reconcile & sync remote folders from PostgreSQL into local persistent SQLite
 */
export async function syncFoldersFromRemote(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production',
  remoteFolders: any[]
): Promise<void> {
  const { drizzle } = await ensureDb();

  // 1. Reconcile deletions: remove local folders in this scope absent from remote (ONLY if already synced)
  const remoteFolderIds = remoteFolders.map((rf) => rf.id).filter(Boolean);
  if (remoteFolderIds.length > 0) {
    await drizzle
      .delete(folders)
      .where(
        and(
          eq(folders.workspaceId, workspaceId),
          eq(folders.teamId, teamId),
          eq(folders.environment, environment),
          eq(folders.syncStatus, 'synced'),
          notInArray(folders.id, remoteFolderIds)
        )
      );
  } else {
    await drizzle
      .delete(folders)
      .where(
        and(
          eq(folders.workspaceId, workspaceId),
          eq(folders.teamId, teamId),
          eq(folders.environment, environment),
          eq(folders.syncStatus, 'synced')
        )
      );
  }

  // 2. Fetch any items pending deletion in local queue to avoid ghost revive
  let pendingDeleteIds = new Set<string>();
  if (remoteFolderIds.length > 0) {
    const pendingDeletes = await drizzle
      .select({ entityId: syncQueue.entityId })
      .from(syncQueue)
      .where(
        and(
          eq(syncQueue.entityType, 'folder'),
          eq(syncQueue.action, 'delete'),
          inArray(syncQueue.status, ['pending', 'syncing']),
          inArray(syncQueue.entityId, remoteFolderIds)
        )
      );
    pendingDeleteIds = new Set(pendingDeletes.map((p) => p.entityId));
  }

  // 3. Upsert returned folders (marking them as synced)
  for (const rf of remoteFolders) {
    if (pendingDeleteIds.has(rf.id)) continue;

    const createdAtStr = rf.createdAt
      ? typeof rf.createdAt === 'string'
        ? rf.createdAt
        : new Date(rf.createdAt).toISOString()
      : new Date().toISOString();
    const updatedAtStr = rf.updatedAt
      ? typeof rf.updatedAt === 'string'
        ? rf.updatedAt
        : new Date(rf.updatedAt).toISOString()
      : new Date().toISOString();

    await drizzle
      .insert(folders)
      .values({
        id: rf.id,
        workspaceId,
        teamId,
        environment,
        name: rf.name,
        description: rf.description || null,
        createdBy: rf.createdBy || 'Unknown',
        createdById: rf.createdById || null,
        createdAt: createdAtStr,
        updatedAt: updatedAtStr,
        syncStatus: 'synced',
      })
      .onConflictDoUpdate({
        target: folders.id,
        set: {
          name: rf.name,
          description: rf.description || null,
          createdBy: rf.createdBy || 'Unknown',
          createdById: rf.createdById || null,
          updatedAt: updatedAtStr,
          syncStatus: 'synced',
        },
      });
  }
}

/**
 * Reconcile & sync remote environment variables from PostgreSQL into local persistent SQLite
 */
export async function syncEnvsFromRemote(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production',
  remoteEnvs: any[],
  folderScope?: string | null
): Promise<void> {
  const { drizzle } = await ensureDb();

  // 1. Reconcile deletions: remove local envs in this scope absent from remote (ONLY if already synced)
  const remoteEnvIds = remoteEnvs.map((re) => re.id).filter(Boolean);
  const scopeConditions = [
    eq(envs.workspaceId, workspaceId),
    eq(envs.teamId, teamId),
    eq(envs.environment, environment),
    eq(envs.syncStatus, 'synced'),
  ];

  if (folderScope !== undefined) {
    if (folderScope === null) {
      scopeConditions.push(isNull(envs.folderId));
    } else {
      scopeConditions.push(eq(envs.folderId, folderScope));
    }
  }

  if (remoteEnvIds.length > 0) {
    await drizzle
      .delete(envs)
      .where(and(...scopeConditions, notInArray(envs.id, remoteEnvIds)));
  } else {
    await drizzle
      .delete(envs)
      .where(and(...scopeConditions));
  }

  // 2. Fetch any envs pending deletion in local queue to avoid ghost revive
  let pendingDeleteIds = new Set<string>();
  if (remoteEnvIds.length > 0) {
    const pendingDeletes = await drizzle
      .select({ entityId: syncQueue.entityId })
      .from(syncQueue)
      .where(
        and(
          eq(syncQueue.entityType, 'env'),
          eq(syncQueue.action, 'delete'),
          inArray(syncQueue.status, ['pending', 'syncing']),
          inArray(syncQueue.entityId, remoteEnvIds)
        )
      );
    pendingDeleteIds = new Set(pendingDeletes.map((p) => p.entityId));
  }

  // 3. Upsert returned envs (marking them as synced)
  for (const re of remoteEnvs) {
    if (pendingDeleteIds.has(re.id)) continue;

    const createdAtStr = re.createdAt
      ? typeof re.createdAt === 'string'
        ? re.createdAt
        : new Date(re.createdAt).toISOString()
      : new Date().toISOString();
    const updatedAtStr = re.updatedAt
      ? typeof re.updatedAt === 'string'
        ? re.updatedAt
        : new Date(re.updatedAt).toISOString()
      : new Date().toISOString();

    const isSecret = Boolean(re.isSecret);
    const valueToStore = isSecret ? encryptEnvValue(re.value) : re.value;

    await drizzle
      .insert(envs)
      .values({
        id: re.id,
        workspaceId,
        teamId,
        environment,
        folderId: re.folderId || null,
        key: re.key,
        value: valueToStore,
        isSecret: isSecret,
        comment: re.comment || null,
        createdBy: re.createdBy || 'Unknown',
        createdById: re.createdById || null,
        createdAt: createdAtStr,
        updatedAt: updatedAtStr,
        syncStatus: 'synced',
      })
      .onConflictDoUpdate({
        target: envs.id,
        set: {
          folderId: re.folderId || null,
          key: re.key,
          value: valueToStore,
          isSecret: isSecret,
          comment: re.comment || null,
          createdBy: re.createdBy || 'Unknown',
          createdById: re.createdById || null,
          updatedAt: updatedAtStr,
          syncStatus: 'synced',
        },
      });
  }
}

