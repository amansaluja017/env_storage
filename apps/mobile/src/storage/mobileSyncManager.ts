import { AppState, AppStateStatus } from 'react-native';
import { useState, useEffect } from 'react';
import { apiClient, protoRequest } from '../utils/apiClient';
import {
  FolderActionRequestProtoType,
  FolderActionResponseProtoType,
  DeleteEntityRequestProtoType,
  UpsertEnvRequestProtoType,
  UpsertEnvResponseProtoType,
  ApiResponseProtoType,
  IFolderActionRequestProto,
  IFolderActionResponseProto,
  IDeleteEntityRequestProto,
  IUpsertEnvRequestProto,
  IUpsertEnvResponseProto,
  IApiResponseProto,
} from '@tubo/proto';
import {
  getPendingSyncQueue,
  updateSyncItemStatus,
  removeSyncItem,
  markEntitySynced,
  getPendingSyncCount,
  syncEnvsFromRemote,
  reconcileBulkImportedEnvs,
  hydrateVaultFromRemote,
  deleteMobileFolder,
  deleteMobileEnv,
  SyncQueueItem,
} from './mobileSqlite';

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  lastError: string | null;
}

type SyncStatusListener = (status: SyncStatus) => void;

class MobileSyncManager {
  private isSyncing = false;
  private pendingCount = 0;
  private lastSyncTime: Date | null = null;
  private lastError: string | null = null;
  private listeners: Set<SyncStatusListener> = new Set();
  private activeBaseUrl: string = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
  private syncTimer: any = null;

  constructor() {
    // Listen for app coming to foreground to trigger sync
    AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        this.triggerSync();
      }
    });

    // Refresh pending count on initialization
    this.refreshPendingCount();
  }

  public setApiBaseUrl(url: string) {
    if (url) {
      this.activeBaseUrl = url.replace(/\/+$/, '');
    }
  }

  public getSyncStatus(): SyncStatus {
    return {
      isSyncing: this.isSyncing,
      pendingCount: this.pendingCount,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
    };
  }

  public addListener(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getSyncStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const status = this.getSyncStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.warn('SyncStatusListener error:', err);
      }
    }
  }

  public async refreshPendingCount(): Promise<number> {
    try {
      this.pendingCount = await getPendingSyncCount();
      this.notify();
      return this.pendingCount;
    } catch {
      return this.pendingCount;
    }
  }

  /**
   * Bi-directional synchronization:
   * 1. Pushes any pending offline mutations from SQLite to PostgreSQL first
   * 2. Pulls and reconciles all folders & environment variables from PostgreSQL into SQLite
   * Makes PostgreSQL the authoritative source of truth.
   */
  public async syncVaultFromRemote(
    workspaceId: string,
    teamId: string,
    environment: 'development' | 'staging' | 'production',
    apiBaseUrl?: string
  ): Promise<{ foldersCount: number; envsCount: number }> {
    const baseUrl = apiBaseUrl || this.activeBaseUrl || (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
    if (!baseUrl || !workspaceId || !teamId) {
      return { foldersCount: 0, envsCount: 0 };
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notify();

    try {
      // 1. Drain pending changes first to prevent clobbering offline edits
      await this.triggerSync(baseUrl);

      // 2. Hydrate from remote PostgreSQL into SQLite
      const result = await hydrateVaultFromRemote(workspaceId, teamId, environment, baseUrl);
      this.lastSyncTime = new Date();
      return result;
    } catch (err: any) {
      console.warn('[MobileSyncManager] Vault sync error:', err?.message || err);
      this.lastError = err?.message || 'Sync failed';
      throw err;
    } finally {
      this.isSyncing = false;
      this.pendingCount = await getPendingSyncCount();
      this.notify();
    }
  }

  /**
   * Drain the pending sync queue in the background.
   * Multiple calls while syncing will be debounced / handled by the ongoing drain loop.
   */
  public async triggerSync(apiBaseUrl?: string): Promise<void> {
    if (apiBaseUrl) {
      this.activeBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    }

    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notify();

    try {
      const baseUrl = this.activeBaseUrl || (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
      if (!baseUrl) {
        this.isSyncing = false;
        this.notify();
        return;
      }

      let hasMore = true;
      let consecutiveNetworkErrors = 0;

      while (hasMore) {
        const batch = await getPendingSyncQueue(10);
        if (!batch || batch.length === 0) {
          hasMore = false;
          break;
        }

        let processedInBatch = 0;
        for (const item of batch) {
          const success = await this.processSyncItem(item, baseUrl);
          if (!success) {
            consecutiveNetworkErrors++;
            // If network appears down, stop spinning to conserve battery & bandwidth
            if (consecutiveNetworkErrors >= 3) {
              hasMore = false;
              break;
            }
          } else {
            processedInBatch++;
            consecutiveNetworkErrors = 0;
          }
        }

        // If no items made progress in this batch, avoid infinite spinning
        if (processedInBatch === 0) {
          hasMore = false;
          break;
        }

        this.pendingCount = await getPendingSyncCount();
        this.notify();
      }

      this.lastSyncTime = new Date();
    } catch (err: any) {
      console.warn('[MobileSyncManager] Sync cycle error:', err?.message || err);
      this.lastError = err?.message || 'Sync failed';
    } finally {
      this.isSyncing = false;
      this.pendingCount = await getPendingSyncCount();
      this.notify();
    }
  }

  private async processSyncItem(item: SyncQueueItem, baseUrl: string): Promise<boolean> {
    await updateSyncItemStatus(item.id, 'syncing');

    let payload: any;
    try {
      payload = JSON.parse(item.payload);
    } catch {
      // Corrupt payload: remove item to unblock queue
      await removeSyncItem(item.id);
      return true;
    }

    try {
      switch (`${item.entityType}:${item.action}`) {
        case 'folder:create': {
          try {
            await protoRequest<IFolderActionRequestProto, IFolderActionResponseProto>(
              `${baseUrl}/api/proto/folder.create`,
              {
                id: item.entityId,
                workspaceId: payload.workspaceId,
                teamId: payload.teamId,
                environment: payload.environment,
                name: payload.name,
                description: payload.description || undefined,
              },
              FolderActionRequestProtoType,
              FolderActionResponseProtoType
            );
          } catch {
            await apiClient.post(`${baseUrl}/trpc/folder.create`, {
              id: item.entityId,
              workspaceId: payload.workspaceId,
              teamId: payload.teamId,
              environment: payload.environment,
              name: payload.name,
              description: payload.description || undefined,
            });
          }
          await markEntitySynced('folder', item.entityId);
          await removeSyncItem(item.id);
          return true;
        }

        case 'folder:update': {
          try {
            await protoRequest<IFolderActionRequestProto, IFolderActionResponseProto>(
              `${baseUrl}/api/proto/folder.update`,
              {
                id: item.entityId,
                teamId: payload.teamId,
                name: payload.name,
                description: payload.description || undefined,
              },
              FolderActionRequestProtoType,
              FolderActionResponseProtoType
            );
          } catch {
            await apiClient.post(`${baseUrl}/trpc/folder.update`, {
              folderId: item.entityId,
              teamId: payload.teamId,
              name: payload.name,
              description: payload.description || undefined,
            });
          }
          await markEntitySynced('folder', item.entityId);
          await removeSyncItem(item.id);
          return true;
        }

        case 'folder:delete': {
          try {
            await protoRequest<IDeleteEntityRequestProto, IApiResponseProto>(
              `${baseUrl}/api/proto/folder.delete`,
              {
                id: item.entityId,
                teamId: payload.teamId,
                deleteEnvs: payload.deleteEnvs ?? false,
              },
              DeleteEntityRequestProtoType,
              ApiResponseProtoType
            );
          } catch (protoErr: any) {
            try {
              await apiClient.post(`${baseUrl}/trpc/folder.delete`, {
                folderId: item.entityId,
                teamId: payload.teamId,
                deleteEnvs: payload.deleteEnvs ?? false,
              });
            } catch (err: any) {
              const status = err?.response?.status;
              const errMsg = (err?.response?.data?.error?.message || err?.message || '').toLowerCase();
              if (status === 404 || errMsg.includes('not found') || errMsg.includes('does not exist')) {
                // Resource is already gone on server, proceed to remove from queue
              } else {
                throw err;
              }
            }
          }
          await removeSyncItem(item.id);
          await deleteMobileFolder(item.entityId, payload.deleteEnvs ?? false);
          return true;
        }

        case 'env:create':
        case 'env:update': {
          try {
            await protoRequest<IUpsertEnvRequestProto, IUpsertEnvResponseProto>(
              `${baseUrl}/api/proto/env.upsert`,
              {
                id: item.entityId,
                workspaceId: payload.workspaceId,
                teamId: payload.teamId,
                environment: payload.environment,
                folderId: payload.folderId || null,
                key: payload.key,
                value: payload.value,
                isSecret: payload.isSecret ?? true,
                comment: payload.comment || undefined,
              },
              UpsertEnvRequestProtoType,
              UpsertEnvResponseProtoType
            );
          } catch {
            await apiClient.post(`${baseUrl}/trpc/env.upsert`, {
              id: item.entityId,
              workspaceId: payload.workspaceId,
              teamId: payload.teamId,
              environment: payload.environment,
              folderId: payload.folderId || null,
              key: payload.key,
              value: payload.value,
              isSecret: payload.isSecret ?? true,
              comment: payload.comment || undefined,
            });
          }
          await markEntitySynced('env', item.entityId);
          await removeSyncItem(item.id);
          return true;
        }

        case 'env:delete': {
          try {
            await protoRequest<IDeleteEntityRequestProto, IApiResponseProto>(
              `${baseUrl}/api/proto/env.delete`,
              {
                id: item.entityId,
                teamId: payload.teamId,
              },
              DeleteEntityRequestProtoType,
              ApiResponseProtoType
            );
          } catch (protoErr: any) {
            try {
              await apiClient.post(`${baseUrl}/trpc/env.delete`, {
                id: item.entityId,
                teamId: payload.teamId,
              });
            } catch (err: any) {
              const status = err?.response?.status;
              const errMsg = (err?.response?.data?.error?.message || err?.message || '').toLowerCase();
              if (status === 404 || errMsg.includes('not found') || errMsg.includes('does not exist')) {
                // Resource is already gone on server, proceed to remove from queue
              } else {
                throw err;
              }
            }
          }
          await removeSyncItem(item.id);
          await deleteMobileEnv(item.entityId);
          return true;
        }

        case 'env:bulk_import': {
          const res = await apiClient.post(`${baseUrl}/trpc/env.bulkImport`, {
            workspaceId: payload.workspaceId,
            teamId: payload.teamId,
            environment: payload.environment,
            folderId: payload.folderId || null,
            rawDotEnv: payload.rawDotEnv,
          });

          const imported = res.data?.result?.data;
          const items = Array.isArray(imported)
            ? imported
            : Array.isArray(imported?.items)
            ? imported.items
            : null;

          if (items && items.length > 0) {
            const importedKeys = items.map((i: any) => i.key).filter(Boolean);
            await reconcileBulkImportedEnvs(
              payload.workspaceId,
              payload.teamId,
              payload.environment,
              importedKeys,
              payload.folderId
            );
            await syncEnvsFromRemote(
              payload.workspaceId,
              payload.teamId,
              payload.environment,
              items,
              payload.folderId
            );
          }
          await removeSyncItem(item.id);
          return true;
        }

        default: {
          console.warn('[MobileSyncManager] Unknown sync action:', item.entityType, item.action);
          await removeSyncItem(item.id);
          return true;
        }
      }
    } catch (err: any) {
      const isNetworkError = !err?.response || err?.code === 'ECONNABORTED' || err?.message?.includes('Network');
      const errorMsg = err?.response?.data?.error?.message || err?.message || 'Sync failed';

      console.warn(`[MobileSyncManager] Failed to sync ${item.entityType}:${item.action}:`, errorMsg);
      this.lastError = errorMsg;

      const newRetryCount = (item.retryCount || 0) + 1;
      if (newRetryCount >= 5) {
        // Failed after max retries
        await updateSyncItemStatus(item.id, 'failed', errorMsg);
      } else {
        // Return to pending to retry on next cycle
        await updateSyncItemStatus(item.id, 'pending', errorMsg);
      }

      return !isNetworkError;
    }
  }
}

export const mobileSyncManager = new MobileSyncManager();

/**
 * React Hook for real-time mobile sync status
 */
export function useMobileSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(mobileSyncManager.getSyncStatus());

  useEffect(() => {
    const unsubscribe = mobileSyncManager.addListener(setStatus);
    return unsubscribe;
  }, []);

  return status;
}
