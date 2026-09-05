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
  createdAt: string;
  updatedAt: string;
}

// In-memory fallback arrays for environments without native SQLite binding (e.g. web/preview)
let memoryFoldersStore: FolderItem[] = [];
let memorySqliteStore: EnvItem[] = [];

let expoDbInstance: any = null;
let drizzleDb: ExpoSQLiteDatabase<{ folders: typeof folders; envs: typeof envs }> | null = null;
let isNativeDbReady = false;

/**
 * Initialize SQLite Database & Drizzle ORM in Mobile
 */
export async function initMobileSqlite(): Promise<void> {
  try {
    if (SQLite && typeof SQLite.openDatabaseAsync === 'function') {
      expoDbInstance = await SQLite.openDatabaseAsync('mobile_env_vault.db');
      await expoDbInstance.execAsync(`
        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_id TEXT NOT NULL,
          team_id TEXT NOT NULL,
          environment TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_by TEXT NOT NULL DEFAULT 'Unknown',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_folders_scope ON folders (workspace_id, team_id, environment);

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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_envs_team ON envs (workspace_id, team_id, environment);
        CREATE INDEX IF NOT EXISTS idx_envs_folder ON envs (folder_id);
        CREATE INDEX IF NOT EXISTS idx_envs_key ON envs (key);
      `);

      // Migrations: Ensure created_by and folder_id columns exist in case upgrading an existing database
      try {
        await expoDbInstance.execAsync(`ALTER TABLE envs ADD COLUMN created_by TEXT NOT NULL DEFAULT 'Unknown';`);
      } catch {
        // column already exists, safe to ignore
      }
      try {
        await expoDbInstance.execAsync(`ALTER TABLE envs ADD COLUMN folder_id TEXT;`);
      } catch {
        // column already exists, safe to ignore
      }

      // Initialize Drizzle ORM on top of the Expo SQLite database
      drizzleDb = drizzle(expoDbInstance, { schema: { folders, envs } });
      isNativeDbReady = true;

      // Clean any leftover mock data
      try {
        await expoDbInstance.runAsync("DELETE FROM envs WHERE id LIKE 'env_10%' OR id = 'env_uqkayec4';");
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.log('Mobile SQLite fallback active:', err);
  }
}

/**
 * Query all folders for a team & environment with variable counts
 */
export async function getMobileFolders(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production'
): Promise<FolderItem[]> {
  if (isNativeDbReady && drizzleDb) {
    try {
      const folderRows = await drizzleDb
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
      const envRows = await drizzleDb
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
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        envCount: countMap.get(f.id) || 0,
      }));
    } catch (e) {
      console.log('Error querying mobile SQLite folders:', e);
    }
  }

  // Memory fallback
  return memoryFoldersStore
    .filter(
      f =>
        f.workspaceId === workspaceId &&
        f.teamId === teamId &&
        f.environment === environment
    )
    .map(f => ({
      ...f,
      envCount: memorySqliteStore.filter(e => e.folderId === f.id).length,
    }));
}

/**
 * Create a new folder in Mobile SQLite
 */
export async function createMobileFolder(data: {
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  name: string;
  description?: string;
  createdBy?: string;
}): Promise<FolderItem> {
  const id = 'fld_' + Math.random().toString(36).substring(2, 10);
  const now = new Date().toISOString();
  const createdBy = data.createdBy || 'Mobile User';
  const trimmedName = data.name.trim();

  if (isNativeDbReady && drizzleDb) {
    try {
      await drizzleDb.insert(folders).values({
        id,
        workspaceId: data.workspaceId,
        teamId: data.teamId,
        environment: data.environment,
        name: trimmedName,
        description: data.description?.trim() || null,
        createdBy,
        createdAt: now,
        updatedAt: now,
      });

      return {
        id,
        workspaceId: data.workspaceId,
        teamId: data.teamId,
        environment: data.environment,
        name: trimmedName,
        description: data.description?.trim(),
        createdBy,
        createdAt: now,
        updatedAt: now,
        envCount: 0,
      };
    } catch (e) {
      console.log('Error creating folder in mobile SQLite:', e);
    }
  }

  // Memory fallback
  const newFolder: FolderItem = {
    id,
    workspaceId: data.workspaceId,
    teamId: data.teamId,
    environment: data.environment,
    name: trimmedName,
    description: data.description?.trim(),
    createdBy,
    createdAt: now,
    updatedAt: now,
    envCount: 0,
  };
  memoryFoldersStore.push(newFolder);
  return newFolder;
}

/**
 * Delete a folder from Mobile SQLite
 * @param deleteEnvs If true, deletes all env variables inside the folder. If false, unlinks them to root.
 */
export async function deleteMobileFolder(folderId: string, deleteEnvs: boolean = false): Promise<boolean> {
  if (isNativeDbReady && drizzleDb) {
    try {
      if (deleteEnvs) {
        await drizzleDb.delete(envs).where(eq(envs.folderId, folderId));
      } else {
        await drizzleDb
          .update(envs)
          .set({ folderId: null, updatedAt: new Date().toISOString() })
          .where(eq(envs.folderId, folderId));
      }
      await drizzleDb.delete(folders).where(eq(folders.id, folderId));
      return true;
    } catch (e) {
      console.log('Error deleting folder from mobile SQLite:', e);
    }
  }

  // Memory fallback
  if (deleteEnvs) {
    memorySqliteStore = memorySqliteStore.filter(e => e.folderId !== folderId);
  } else {
    memorySqliteStore = memorySqliteStore.map(e => (e.folderId === folderId ? { ...e, folderId: null } : e));
  }
  memoryFoldersStore = memoryFoldersStore.filter(f => f.id !== folderId);
  return true;
}

/**
 * Query environment variables using Drizzle ORM by team, environment, and optional folder
 */
export async function getMobileEnvs(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production',
  searchQuery?: string,
  folderId?: string | null | 'all'
): Promise<EnvItem[]> {
  if (isNativeDbReady && drizzleDb) {
    try {
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
      const rows = await drizzleDb
        .select()
        .from(envs)
        .where(and(...conditions))
        .orderBy(asc(envs.key));

      // Get folder names map
      const allFolders = await drizzleDb
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
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } catch (e) {
      console.log('Error querying mobile SQLite envs with Drizzle:', e);
    }
  }

  // Fallback in-memory query
  const folderNameMap = new Map(memoryFoldersStore.map(f => [f.id, f.name]));
  return memorySqliteStore.filter(item => {
    const matchesScope =
      item.workspaceId === workspaceId &&
      item.teamId === teamId &&
      item.environment === environment;

    if (!matchesScope) return false;

    if (folderId && folderId !== 'all') {
      if (folderId === 'root') {
        if (item.folderId) return false;
      } else if (item.folderId !== folderId) {
        return false;
      }
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        item.key.toLowerCase().includes(q) ||
        (item.comment && item.comment.toLowerCase().includes(q))
      );
    }
    return true;
  }).map(item => ({
    ...item,
    folderName: item.folderId ? folderNameMap.get(item.folderId) : undefined,
  }));
}

/**
 * Upsert (Insert or Update) an environment variable using Drizzle ORM
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
}): Promise<EnvItem> {
  const now = new Date().toISOString();
  const createdBy = data.createdBy || 'Mobile User';
  const isSecret = data.isSecret ?? true;
  const normalizedKey = data.key.toUpperCase().trim();
  const folderId = data.folderId || null;

  let targetId = data.id;

  if (isNativeDbReady && drizzleDb && expoDbInstance) {
    try {
      // If no ID was provided, check if key already exists in this team/environment (and folder)
      if (!targetId) {
        const existingRow = await drizzleDb
          .select({ id: envs.id })
          .from(envs)
          .where(
            and(
              eq(envs.workspaceId, data.workspaceId),
              eq(envs.teamId, data.teamId),
              eq(envs.environment, data.environment),
              eq(envs.key, normalizedKey)
            )
          )
          .limit(1);

        if (existingRow.length > 0) {
          targetId = existingRow[0].id;
        }
      }

      targetId = targetId || 'env_' + Math.random().toString(36).substring(2, 10);

      // Upsert using Drizzle ORM onConflictDoUpdate
      await drizzleDb
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
            createdBy: createdBy,
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
        createdAt: now,
        updatedAt: now,
      };
    } catch (e) {
      console.log('Error executing Drizzle SQLite upsert in mobile:', e);
    }
  }

  // Memory fallback
  targetId = targetId || 'env_' + Math.random().toString(36).substring(2, 10);
  const newItem: EnvItem = {
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
    createdAt: now,
    updatedAt: now,
  };

  const existingIdx = memorySqliteStore.findIndex(
    e =>
      e.id === targetId ||
      (e.workspaceId === data.workspaceId &&
        e.teamId === data.teamId &&
        e.environment === data.environment &&
        e.key === normalizedKey)
  );

  if (existingIdx >= 0) {
    memorySqliteStore[existingIdx] = {
      ...memorySqliteStore[existingIdx],
      folderId,
      key: normalizedKey,
      value: data.value,
      isSecret,
      comment: data.comment,
      createdBy: createdBy,
      updatedAt: now,
    };
    return memorySqliteStore[existingIdx];
  } else {
    memorySqliteStore.push(newItem);
    return newItem;
  }
}

/**
 * Delete an environment variable by ID using Drizzle ORM
 */
export async function deleteMobileEnv(id: string): Promise<boolean> {
  if (isNativeDbReady && drizzleDb) {
    try {
      await drizzleDb.delete(envs).where(eq(envs.id, id));
    } catch (e) {
      console.log('Error deleting from Mobile SQLite with Drizzle:', e);
    }
  }

  memorySqliteStore = memorySqliteStore.filter(e => e.id !== id);
  return true;
}

/**
 * Bulk import raw .env contents directly into Mobile SQLite via Drizzle ORM
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
      value = value.slice(1, -1);
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
 * Export all environment variables for a team as a .env formatted string
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
      return `${commentPart}${e.key}="${e.value}"`;
    })
    .join('\n\n');
}

/**
 * Query all raw rows using Drizzle ORM for table inspector
 */
export async function getAllMobileEnvsRaw(): Promise<any[]> {
  if (isNativeDbReady && drizzleDb) {
    try {
      return await drizzleDb.select().from(envs).orderBy(desc(envs.createdAt));
    } catch (e) {
      console.log('Error reading Drizzle SQLite rows:', e);
    }
  }
  return memorySqliteStore;
}

/**
 * Query all raw folders using Drizzle ORM
 */
export async function getAllMobileFoldersRaw(): Promise<any[]> {
  if (isNativeDbReady && drizzleDb) {
    try {
      return await drizzleDb.select().from(folders).orderBy(desc(folders.createdAt));
    } catch (e) {
      console.log('Error reading Drizzle SQLite folders:', e);
    }
  }
  return memoryFoldersStore;
}

/**
 * Execute custom SQL query against Mobile SQLite
 */
export async function executeMobileSqliteQuery(sqlStr: string): Promise<any[]> {
  if (isNativeDbReady && expoDbInstance) {
    return (await expoDbInstance.getAllAsync(sqlStr)) as any[];
  }
  return memorySqliteStore;
}

/**
 * Get Mobile SQLite database statistics
 */
export async function getMobileSqliteStats(): Promise<{
  isNative: boolean;
  dbName: string;
  totalRows: number;
  totalFolders: number;
  tables: string[];
}> {
  if (isNativeDbReady && expoDbInstance && drizzleDb) {
    try {
      const countRes = await drizzleDb.select({ count: sql<number>`count(*)` }).from(envs);
      const folderCountRes = await drizzleDb.select({ count: sql<number>`count(*)` }).from(folders);
      const tablesRes = (await expoDbInstance.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
      )) as any[];
      return {
        isNative: true,
        dbName: 'mobile_env_vault.db (Drizzle ORM)',
        totalRows: countRes[0]?.count ?? 0,
        totalFolders: folderCountRes[0]?.count ?? 0,
        tables: (tablesRes || []).map((t: any) => t.name),
      };
    } catch (e) {
      console.log('Error getting SQLite stats:', e);
    }
  }
  return {
    isNative: false,
    dbName: 'memory_fallback',
    totalRows: memorySqliteStore.length,
    totalFolders: memoryFoldersStore.length,
    tables: ['folders', 'envs'],
  };
}
