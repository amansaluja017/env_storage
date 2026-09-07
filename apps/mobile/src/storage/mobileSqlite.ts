import * as SQLite from 'expo-sqlite';
import { drizzle, ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { eq, and, or, like, desc, asc, sql, isNull } from 'drizzle-orm';

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
let drizzleDb: ExpoSQLiteDatabase<{ folders: typeof folders; envs: typeof envs }> | null = null;
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
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      } catch (migErr) {
        console.log('Notice on folders column migration:', migErr);
      }

      // 3. Create indexes safely now that columns are guaranteed to exist
      const indexQueries = [
        'CREATE INDEX IF NOT EXISTS idx_folders_scope ON folders (workspace_id, team_id, environment);',
        'CREATE INDEX IF NOT EXISTS idx_envs_team ON envs (workspace_id, team_id, environment);',
        'CREATE INDEX IF NOT EXISTS idx_envs_folder ON envs (folder_id);',
        'CREATE INDEX IF NOT EXISTS idx_envs_key ON envs (key);',
      ];
      for (const idxQuery of indexQueries) {
        try {
          await db.execAsync(idxQuery);
        } catch (idxErr) {
          console.log('Notice on index creation:', idxErr);
        }
      }

      // 4. Initialize Drizzle ORM on top of the persistent SQLite database
      drizzleDb = drizzle(db, { schema: { folders, envs } });

      // 5. Clean any leftover mock data
      try {
        await db.runAsync("DELETE FROM envs WHERE id = 'env_uqkayec4';");
      } catch {
        // ignore
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
 * Ensure persistent database is opened and ready before executing any operation
 */
export async function ensureDb(): Promise<{
  db: SQLite.SQLiteDatabase;
  drizzle: ExpoSQLiteDatabase<{ folders: typeof folders; envs: typeof envs }>;
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
    })
    .onConflictDoUpdate({
      target: folders.id,
      set: {
        name: trimmedName,
        description: data.description?.trim() || null,
        updatedAt: now,
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
    value: r.value,
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
      value: data.value,
      isSecret: isSecret,
      comment: data.comment || null,
      createdBy,
      createdById: data.createdById || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: envs.id,
      set: {
        workspaceId: data.workspaceId,
        teamId: data.teamId,
        environment: data.environment,
        folderId: folderId,
        key: normalizedKey,
        value: data.value,
        isSecret: isSecret,
        comment: data.comment || null,
        updatedAt: now,
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
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
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
  for (const rf of remoteFolders) {
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
      })
      .onConflictDoUpdate({
        target: folders.id,
        set: {
          name: rf.name,
          description: rf.description || null,
          createdBy: rf.createdBy || 'Unknown',
          createdById: rf.createdById || null,
          updatedAt: updatedAtStr,
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
  remoteEnvs: any[]
): Promise<void> {
  const { drizzle } = await ensureDb();
  for (const re of remoteEnvs) {
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

    await drizzle
      .insert(envs)
      .values({
        id: re.id,
        workspaceId,
        teamId,
        environment,
        folderId: re.folderId || null,
        key: re.key,
        value: re.value,
        isSecret: Boolean(re.isSecret),
        comment: re.comment || null,
        createdBy: re.createdBy || 'Unknown',
        createdById: re.createdById || null,
        createdAt: createdAtStr,
        updatedAt: updatedAtStr,
      })
      .onConflictDoUpdate({
        target: envs.id,
        set: {
          folderId: re.folderId || null,
          key: re.key,
          value: re.value,
          isSecret: Boolean(re.isSecret),
          comment: re.comment || null,
          createdBy: re.createdBy || 'Unknown',
          createdById: re.createdById || null,
          updatedAt: updatedAtStr,
        },
      });
  }
}

