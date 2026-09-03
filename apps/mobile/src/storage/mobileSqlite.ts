import * as SQLite from 'expo-sqlite';

export interface EnvItem {
  id: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  key: string;
  value: string;
  isSecret: boolean;
  comment?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory fallback array for environments without native SQLite binding (e.g. web/preview)
let memorySqliteStore: EnvItem[] = [
  {
    id: 'env_101',
    workspaceId: 'ws_demo_main',
    teamId: 'team_backend',
    environment: 'development',
    key: 'DATABASE_URL',
    value: 'postgresql://postgres:secret@localhost:5432/tubo_dev',
    isSecret: true,
    comment: 'Postgres primary database connection string (Stored in Mobile SQLite)',
    createdBy: 'Alex Vance',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'env_102',
    workspaceId: 'ws_demo_main',
    teamId: 'team_backend',
    environment: 'development',
    key: 'REDIS_CACHE_URL',
    value: 'redis://default:auth_token_99@127.0.0.1:6379',
    isSecret: true,
    comment: 'Session and cache store (Stored in Mobile SQLite)',
    createdBy: 'Alex Vance',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'env_103',
    workspaceId: 'ws_demo_main',
    teamId: 'team_backend',
    environment: 'development',
    key: 'API_PORT',
    value: '4000',
    isSecret: false,
    comment: 'Backend port number (Stored in Mobile SQLite)',
    createdBy: 'Alex Vance',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'env_104',
    workspaceId: 'ws_demo_main',
    teamId: 'team_backend',
    environment: 'production',
    key: 'STRIPE_SECRET_KEY',
    value: 'sk_live_51M0x9234857109283749281',
    isSecret: true,
    comment: 'Stripe live production gateway key (Mobile SQLite)',
    createdBy: 'Alex Vance',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'env_105',
    workspaceId: 'ws_demo_main',
    teamId: 'team_frontend',
    environment: 'development',
    key: 'EXPO_PUBLIC_API_URL',
    value: 'http://10.0.2.2:4000/trpc',
    isSecret: false,
    comment: 'Expo mobile server endpoint (Mobile SQLite)',
    createdBy: 'Alex Vance',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let dbInstance: any = null;
let isNativeDbReady = false;

export async function initMobileSqlite(): Promise<void> {
  try {
    if (SQLite && typeof SQLite.openDatabaseAsync === 'function') {
      dbInstance = await SQLite.openDatabaseAsync('mobile_env_vault.db');
      await dbInstance.execAsync(`
        CREATE TABLE IF NOT EXISTS envs (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_id TEXT NOT NULL,
          team_id TEXT NOT NULL,
          environment TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          is_secret INTEGER NOT NULL DEFAULT 1,
          comment TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      isNativeDbReady = true;

      // Check if table is empty, seed initial data into Native SQLite
      const countResult = (await dbInstance.getFirstAsync(
        'SELECT COUNT(*) as count FROM envs;'
      )) as { count: number } | null;
      if (countResult && countResult.count === 0) {
        for (const item of memorySqliteStore) {
          await dbInstance.runAsync(
            `INSERT INTO envs (id, workspace_id, team_id, environment, key, value, is_secret, comment, created_by, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              item.id,
              item.workspaceId,
              item.teamId,
              item.environment,
              item.key,
              item.value,
              item.isSecret ? 1 : 0,
              item.comment || '',
              item.createdBy,
              item.createdAt,
              item.updatedAt,
            ]
          );
        }
      }
    }
  } catch (err) {
    console.log('Mobile SQLite fallback active:', err);
  }
}

export async function getMobileEnvs(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production'
): Promise<EnvItem[]> {
  if (isNativeDbReady && dbInstance) {
    try {
      const rows = (await dbInstance.getAllAsync(
        `SELECT * FROM envs WHERE workspace_id = ? AND team_id = ? AND environment = ? ORDER BY key ASC;`,
        [workspaceId, teamId, environment]
      )) as any[];
      return rows.map((r: any) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        teamId: r.team_id,
        environment: r.environment as any,
        key: r.key,
        value: r.value,
        isSecret: Boolean(r.is_secret),
        comment: r.comment || undefined,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (e) {
      console.log('Error reading native SQLite, returning fallback:', e);
    }
  }

  // Fallback storage filter
  return memorySqliteStore.filter(
    item =>
      item.workspaceId === workspaceId &&
      item.teamId === teamId &&
      item.environment === environment
  );
}

export async function upsertMobileEnv(data: {
  id?: string;
  workspaceId: string;
  teamId: string;
  environment: 'development' | 'staging' | 'production';
  key: string;
  value: string;
  isSecret?: boolean;
  comment?: string;
  createdBy?: string;
}): Promise<EnvItem> {
  const now = new Date().toISOString();
  const id = data.id || 'env_' + Math.random().toString(36).substring(2, 10);
  const createdBy = data.createdBy || 'Mobile User';
  const isSecret = data.isSecret ?? true;

  const newItem: EnvItem = {
    id,
    workspaceId: data.workspaceId,
    teamId: data.teamId,
    environment: data.environment,
    key: data.key,
    value: data.value,
    isSecret,
    comment: data.comment,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  if (isNativeDbReady && dbInstance) {
    try {
      await dbInstance.runAsync(
        `INSERT OR REPLACE INTO envs (id, workspace_id, team_id, environment, key, value, is_secret, comment, created_by, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          newItem.id,
          newItem.workspaceId,
          newItem.teamId,
          newItem.environment,
          newItem.key,
          newItem.value,
          newItem.isSecret ? 1 : 0,
          newItem.comment || '',
          newItem.createdBy,
          newItem.createdAt,
          newItem.updatedAt,
        ]
      );
    } catch (e) {
      console.log('Error saving to Native SQLite:', e);
    }
  }

  // Update memory store
  const existingIdx = memorySqliteStore.findIndex(
    e =>
      e.id === id ||
      (e.workspaceId === data.workspaceId &&
        e.teamId === data.teamId &&
        e.environment === data.environment &&
        e.key === data.key)
  );

  if (existingIdx >= 0) {
    memorySqliteStore[existingIdx] = {
      ...memorySqliteStore[existingIdx],
      key: data.key,
      value: data.value,
      isSecret,
      comment: data.comment,
      updatedAt: now,
    };
    return memorySqliteStore[existingIdx];
  } else {
    memorySqliteStore.push(newItem);
    return newItem;
  }
}

export async function deleteMobileEnv(id: string): Promise<boolean> {
  if (isNativeDbReady && dbInstance) {
    try {
      await dbInstance.runAsync('DELETE FROM envs WHERE id = ?;', [id]);
    } catch (e) {
      console.log('Error deleting from Native SQLite:', e);
    }
  }

  memorySqliteStore = memorySqliteStore.filter(e => e.id !== id);
  return true;
}

export async function bulkImportMobileEnvs(
  workspaceId: string,
  teamId: string,
  environment: 'development' | 'staging' | 'production',
  rawDotEnvContent: string,
  createdBy: string = 'Mobile User'
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
      key,
      value,
      isSecret: true,
      comment: 'Imported into Mobile SQLite',
      createdBy,
    });
    importedCount++;
  }

  return { importedCount };
}
