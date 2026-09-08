import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  Animated,
  RefreshControl,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { useTourTarget } from 'guideway';
import { COLORS } from '../theme';
import {
  initMobileSqlite,
  getMobileEnvs,
  upsertMobileEnv,
  deleteMobileEnv,
  bulkImportMobileEnvs,
  getMobileFolders,
  createMobileFolder,
  updateMobileFolder,
  deleteMobileFolder,
  getMobileVaultStats,
  syncFoldersFromRemote,
  syncEnvsFromRemote,
  enqueueSyncItem,
  EnvItem,
  FolderItem,
} from '../storage/mobileSqlite';
import { mobileSyncManager, useMobileSyncStatus } from '../storage/mobileSyncManager';
import { apiClient } from '../utils/apiClient';
import { ExportEnvsModal } from '../components/ExportEnvsModal';
import { showCustomAlert } from '../components/CustomAlert';
import { FoldersListSkeleton, EnvsListSkeleton } from '../components/Skeleton';

interface EnvVaultScreenProps {
  token: string;
  workspaceId: string;
  teamId: string;
  apiBaseUrl: string;
  user?: { id: string; email: string; name: string; role?: 'admin' | 'member' } | null;
  workspace?: { id: string; name: string; slug: string; ownerId?: string } | null;
  team?: { id: string; workspaceId?: string; name: string; description?: string; createdBy?: string } | null;
  refreshTrigger?: number;
}

interface EnvFormData {
  key: string;
  value: string;
  comment: string;
  isSecret: boolean;
  folderId: string;
}

interface CreateFolderFormData {
  name: string;
  description?: string;
}

interface RawDotEnvFormData {
  rawDotEnv: string;
  folderId?: string;
}

export interface FolderMenuTarget {
  id: string;
  name: string;
  description?: string;
  envCount: number;
  folderObj?: FolderItem | null;
  isSpecial?: boolean;
}

export function EnvVaultScreen({
  token,
  workspaceId,
  teamId,
  workspace,
  team,
  apiBaseUrl,
  user,
  refreshTrigger,
}: EnvVaultScreenProps) {
  const envTabsTargetRef = useTourTarget('tour-env-tabs');
  const searchBarTargetRef = useTourTarget('tour-search-bar');
  const newFolderBtnTargetRef = useTourTarget('tour-new-folder-btn');
  const footerDockTargetRef = useTourTarget('tour-footer-dock');
  const footerAddKeyTargetRef = useTourTarget('tour-footer-add-key');
  const footerNewFolderTargetRef = useTourTarget('tour-footer-new-folder');
  const footerImportEnvTargetRef = useTourTarget('tour-footer-import-env');
  const footerBackupTargetRef = useTourTarget('tour-footer-backup');

  const syncStatus = useMobileSyncStatus();

  const [environment, setEnvironment] = useState<'development' | 'staging' | 'production'>('development');
  const [envsList, setEnvsList] = useState<EnvItem[]>([]);
  const [foldersList, setFoldersList] = useState<FolderItem[]>([]);
  const [vaultStats, setVaultStats] = useState({ totalEnvs: 0, rootEnvs: 0, folderCount: 0 });
  const [currentUserTeamRole, setCurrentUserTeamRole] = useState<'admin' | 'member' | 'owner' | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderMenuTarget, setFolderMenuTarget] = useState<FolderMenuTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [folderSearch, setFolderSearch] = useState('');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  // Section Refresh animation & handler
  const [isRefreshing, setIsRefreshing] = useState(false);
  const spinValue = React.useRef(new Animated.Value(0)).current;

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    spinValue.setValue(0);
    Animated.timing(spinValue, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start();

    try {
      // Drain pending mutations first before refreshing view
      await mobileSyncManager.triggerSync(apiBaseUrl);
      if (selectedFolderId !== null) {
        await fetchEnvs(true);
      } else {
        await fetchFolders(true);
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Folder Modal State (react-hook-form)
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const {
    control: folderControl,
    handleSubmit: handleFolderSubmit,
    reset: resetFolderForm,
    formState: { errors: folderErrors },
  } = useForm<CreateFolderFormData>({
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // Add / Edit Variable Modal State (react-hook-form)
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    control: envControl,
    handleSubmit: handleEnvSubmit,
    reset: resetEnvForm,
    setValue: setEnvValue,
    watch: watchEnv,
    formState: { errors: envErrors },
  } = useForm<EnvFormData>({
    defaultValues: {
      key: '',
      value: '',
      comment: '',
      isSecret: true,
      folderId: '',
    },
  });

  // Bulk Raw .env Modal State (react-hook-form)
  const [rawModalVisible, setRawModalVisible] = useState(false);

  const {
    control: rawControl,
    handleSubmit: handleRawSubmit,
    reset: resetRawForm,
    formState: { errors: rawErrors },
  } = useForm<RawDotEnvFormData>({
    defaultValues: {
      rawDotEnv: '',
      folderId: '',
    },
  });

  const [dbReady, setDbReady] = useState(false);

  // Export Envs ZIP Modal State
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportTargetFolderId, setExportTargetFolderId] = useState<string | null | undefined>(undefined);

  const openExportModal = (targetFolderId?: string | null) => {
    setExportTargetFolderId(targetFolderId);
    setExportModalVisible(true);
  };

  useEffect(() => {
    initMobileSqlite()
      .then(() => {
        setDbReady(true);
        mobileSyncManager.setApiBaseUrl(apiBaseUrl);
        mobileSyncManager.triggerSync(apiBaseUrl);
      })
      .catch((err) => {
        console.log('Error initializing mobile SQLite:', err);
        setDbReady(true);
      });
  }, [apiBaseUrl]);

  // Fetch logged in user's role in this team to evaluate admin privileges
  useEffect(() => {
    if (!teamId || !token) return;
    apiClient
      .get(`${apiBaseUrl}/trpc/team.getMembers`, {
        params: { input: JSON.stringify({ teamId }) },
      })
      .then((res) => {
        if (res.data?.result?.data) {
          const members = res.data.result.data;
          const me = members.find((m: any) => m.userId === user?.id);
          if (me) {
            setCurrentUserTeamRole(me.role || me.userRole || null);
          }
        }
      })
      .catch(() => {});
  }, [teamId, token, user?.id]);

  const isCurrentAdmin =
    user?.role === 'admin' ||
    workspace?.ownerId === user?.id ||
    team?.createdBy === user?.id ||
    currentUserTeamRole === 'admin' ||
    currentUserTeamRole === 'owner';

  const canModify = (item?: { createdById?: string; createdBy?: string } | null) => {
    if (!item) return false;
    if (isCurrentAdmin) return true;
    if (item.createdById && user?.id && item.createdById === user.id) return true;
    if (item.createdBy && user?.name && item.createdBy === user.name) return true;
    if (item.createdBy && user?.id && item.createdBy === user.id) return true;
    return false;
  };

  const fetchFolders = async (awaitRemote: boolean = false) => {
    if (!workspaceId || !teamId) return;
    setFoldersLoading(true);
    try {
      // 1. Read SQLite first (instant local response)
      const [fList, stats] = await Promise.all([
        getMobileFolders(workspaceId, teamId, environment),
        getMobileVaultStats(workspaceId, teamId, environment),
      ]);
      setFoldersList(fList);
      setVaultStats(stats);

      // 2. Background sync: fetch remote folders from PostgreSQL & reconcile into SQLite
      const syncPromise = apiClient
        .get(`${apiBaseUrl}/trpc/folder.list`, {
          params: {
            input: JSON.stringify({
              workspaceId,
              teamId,
              environment,
            }),
          },
        })
        .then(async (res) => {
          const remoteFolders = res.data?.result?.data;
          if (Array.isArray(remoteFolders)) {
            await syncFoldersFromRemote(workspaceId, teamId, environment, remoteFolders);
            const [updatedFList, updatedStats] = await Promise.all([
              getMobileFolders(workspaceId, teamId, environment),
              getMobileVaultStats(workspaceId, teamId, environment),
            ]);
            setFoldersList(updatedFList);
            setVaultStats(updatedStats);
          }
        })
        .catch((err) => {
          console.log('Background folder sync note:', err?.message || err);
        });

      if (awaitRemote) {
        await syncPromise;
      }
    } catch (e) {
      console.log('Error reading Mobile SQLite folders:', e);
    } finally {
      setFoldersLoading(false);
    }
  };

  const fetchEnvs = async (awaitRemote: boolean = false) => {
    if (!workspaceId || !teamId || selectedFolderId === null) return;
    setLoading(true);
    try {
      // 1. Read SQLite first (instant local response)
      const items = await getMobileEnvs(
        workspaceId,
        teamId,
        environment,
        undefined,
        selectedFolderId
      );
      setEnvsList(items);
      const foldersPromise = fetchFolders(awaitRemote);

      // 2. Background sync: fetch remote envs from PostgreSQL & reconcile into SQLite
      const queryFolderId =
        selectedFolderId === 'all'
          ? undefined
          : selectedFolderId === 'root'
          ? null
          : selectedFolderId;

      const syncPromise = apiClient
        .get(`${apiBaseUrl}/trpc/env.list`, {
          params: {
            input: JSON.stringify({
              workspaceId,
              teamId,
              environment,
              folderId: queryFolderId,
            }),
          },
        })
        .then(async (res) => {
          const remoteEnvs = res.data?.result?.data;
          if (Array.isArray(remoteEnvs)) {
            await syncEnvsFromRemote(workspaceId, teamId, environment, remoteEnvs, queryFolderId);
            const updated = await getMobileEnvs(
              workspaceId,
              teamId,
              environment,
              undefined,
              selectedFolderId
            );
            setEnvsList(updated);
            const [fList, stats] = await Promise.all([
              getMobileFolders(workspaceId, teamId, environment),
              getMobileVaultStats(workspaceId, teamId, environment),
            ]);
            setFoldersList(fList);
            setVaultStats(stats);
          }
        })
        .catch((err) => {
          console.log('Background env sync note:', err?.message || err);
        });

      if (awaitRemote) {
        await Promise.all([syncPromise, foldersPromise]);
      }
    } catch (e) {
      console.log('Error reading Mobile SQLite envs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dbReady) {
      if (selectedFolderId !== null) {
        fetchEnvs();
      } else {
        fetchFolders();
      }
    }
  }, [dbReady, workspaceId, teamId, environment, selectedFolderId]);

  // Re-fetch keys/folders when navbar refresh button is pressed
  useEffect(() => {
    if (dbReady && refreshTrigger && refreshTrigger > 0) {
      if (selectedFolderId !== null) {
        fetchEnvs();
      } else {
        fetchFolders();
      }
    }
  }, [refreshTrigger]);

  const openCreateFolder = () => {
    setEditingFolderId(null);
    resetFolderForm({ name: '', description: '' });
    setFolderModalVisible(true);
  };

  const openEditFolder = (folder: FolderItem) => {
    if (!canModify(folder)) {
      showCustomAlert({
        title: 'Permission Denied',
        message: 'Only the creator of this folder or an admin can edit it.',
        type: 'danger',
      });
      return;
    }
    setEditingFolderId(folder.id);
    resetFolderForm({ name: folder.name, description: folder.description || '' });
    setFolderModalVisible(true);
  };

  // Create / Update Folder Handler
  const onSaveFolder = async (data: CreateFolderFormData) => {
    setSavingFolder(true);
    const creatorName = user?.name || 'Mobile User';
    try {
      if (editingFolderId) {
        // 1. Edit existing folder in SQLite first
        await updateMobileFolder(editingFolderId, data.name, data.description);
        setFolderModalVisible(false);
        resetFolderForm({ name: '', description: '' });
        const updatedId = editingFolderId;
        setEditingFolderId(null);
        await fetchFolders();

        // 2. Enqueue sync & trigger background worker
        await enqueueSyncItem({
          entityType: 'folder',
          entityId: updatedId,
          action: 'update',
          payload: {
            folderId: updatedId,
            teamId,
            name: data.name,
            description: data.description || undefined,
          },
        });
        mobileSyncManager.triggerSync(apiBaseUrl);
      } else {
        // 1. Create new folder in SQLite first (instant local response)
        const newFolder = await createMobileFolder({
          workspaceId,
          teamId,
          environment,
          name: data.name,
          description: data.description,
          createdBy: creatorName,
          createdById: user?.id,
        });

        setFolderModalVisible(false);
        resetFolderForm({ name: '', description: '' });
        setSelectedFolderId(newFolder.id);
        await fetchFolders();

        // 2. Enqueue sync & trigger background worker
        await enqueueSyncItem({
          entityType: 'folder',
          entityId: newFolder.id,
          action: 'create',
          payload: {
            id: newFolder.id,
            workspaceId,
            teamId,
            environment,
            name: data.name,
            description: data.description || undefined,
          },
        });
        mobileSyncManager.triggerSync(apiBaseUrl);
      }
    } catch (e: any) {
      showCustomAlert({
        title: editingFolderId ? 'Folder Update Failed' : 'Folder Creation Failed',
        message: e.message || 'Unable to save folder',
        type: 'danger',
      });
    } finally {
      setSavingFolder(false);
    }
  };

  // Delete Folder Handler
  const handleDeleteFolder = (folder: FolderItem) => {
    if (!canModify(folder)) {
      showCustomAlert({
        title: 'Permission Denied',
        message: 'Only the creator of this folder or an admin can delete it.',
        type: 'danger',
      });
      return;
    }

    showCustomAlert({
      title: `Delete Folder "${folder.name}"`,
      message: 'Do you want to delete this folder? Variables inside will be moved to Root (Unfiled).',
      type: 'danger',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Enqueue deletion & trigger background sync first
              await enqueueSyncItem({
                entityType: 'folder',
                entityId: folder.id,
                action: 'delete',
                payload: {
                  folderId: folder.id,
                  teamId,
                  deleteEnvs: false,
                },
              });
              mobileSyncManager.triggerSync(apiBaseUrl);

              // 2. Delete in SQLite (instant local response)
              await deleteMobileFolder(folder.id, false);
              if (selectedFolderId === folder.id) {
                setSelectedFolderId(null);
              }
              await fetchFolders();
              if (selectedFolderId !== null && selectedFolderId !== folder.id) {
                await fetchEnvs();
              }
            } catch (e: any) {
              showCustomAlert({
                title: 'Delete Failed',
                message: e.message,
                type: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  // Save Variable Handler
  const onSaveEnv = async (data: EnvFormData) => {
    setSubmitting(true);
    const creatorName = user?.name || 'Mobile User';
    try {
      const isEditing = Boolean(editingId);

      // 1. Write to SQLite first (instant local response)
      const saved = await upsertMobileEnv({
        id: editingId || undefined,
        workspaceId,
        teamId,
        environment,
        folderId: data.folderId ? data.folderId : null,
        key: data.key.toUpperCase().trim(),
        value: data.value,
        isSecret: data.isSecret,
        comment: data.comment,
        createdBy: creatorName,
        createdById: user?.id,
      });

      setModalVisible(false);
      const targetFolder =
        selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== 'root'
          ? selectedFolderId
          : '';
      resetEnvForm({
        key: '',
        value: '',
        comment: '',
        isSecret: true,
        folderId: targetFolder,
      });
      if (selectedFolderId !== null) {
        await fetchEnvs();
      } else {
        await fetchFolders();
      }

      // 2. Enqueue sync & trigger background worker
      await enqueueSyncItem({
        entityType: 'env',
        entityId: saved.id,
        action: isEditing ? 'update' : 'create',
        payload: {
          id: saved.id,
          workspaceId,
          teamId,
          environment,
          folderId: data.folderId || null,
          key: data.key.toUpperCase().trim(),
          value: data.value,
          isSecret: data.isSecret,
          comment: data.comment || undefined,
        },
      });
      mobileSyncManager.triggerSync(apiBaseUrl);
    } catch (e: any) {
      showCustomAlert({
        title: 'Save Failed',
        message: e.message || 'Unable to save environment variable',
        type: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, keyName: string) => {
    const item = envsList.find(e => e.id === id);
    if (!canModify(item)) {
      showCustomAlert({
        title: 'Permission Denied',
        message: 'Only the creator of this variable or an admin can delete it.',
        type: 'danger',
      });
      return;
    }

    showCustomAlert({
      title: 'Delete Variable',
      message: `Are you sure you want to delete "${keyName}" from the vault?`,
      type: 'danger',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Enqueue deletion & trigger background sync first
              await enqueueSyncItem({
                entityType: 'env',
                entityId: id,
                action: 'delete',
                payload: {
                  id,
                  teamId,
                },
              });
              mobileSyncManager.triggerSync(apiBaseUrl);

              // 2. Delete from SQLite (instant local response)
              await deleteMobileEnv(id);
              if (selectedFolderId !== null) {
                await fetchEnvs();
              } else {
                await fetchFolders();
              }
            } catch (e: any) {
              showCustomAlert({
                title: 'Delete Error',
                message: e.message || 'Failed to delete environment variable',
                type: 'danger',
              });
            }
          },
        },
      ],
    });
  };

  const onImportBulk = async (data: RawDotEnvFormData) => {
    if (!data.rawDotEnv.trim()) return;
    setSubmitting(true);
    try {
      const creatorName = user?.name || 'Mobile User';
      const defaultFolder =
        selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== 'root'
          ? selectedFolderId
          : null;
      const targetFolderId = data.folderId || defaultFolder;

      // 1. Import to SQLite first (instant local response)
      await bulkImportMobileEnvs(
        workspaceId,
        teamId,
        environment,
        data.rawDotEnv,
        creatorName,
        targetFolderId
      );

      setRawModalVisible(false);
      resetRawForm({ rawDotEnv: '', folderId: '' });
      if (selectedFolderId !== null) {
        await fetchEnvs();
      } else {
        await fetchFolders();
      }

      // 2. Enqueue bulk import & trigger background sync
      await enqueueSyncItem({
        entityType: 'env',
        entityId: `bulk-${Date.now()}`,
        action: 'bulk_import',
        payload: {
          workspaceId,
          teamId,
          environment,
          folderId: targetFolderId,
          rawDotEnv: data.rawDotEnv,
        },
      });
      mobileSyncManager.triggerSync(apiBaseUrl);
    } catch (e: any) {
      showCustomAlert({
        title: 'Import Failed',
        message: e.message || 'Unable to import environment variables',
        type: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openAdd = (targetFolderOverride?: string) => {
    setEditingId(null);
    const targetFolder =
      targetFolderOverride !== undefined
        ? targetFolderOverride
        : selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== 'root'
        ? selectedFolderId
        : '';
    resetEnvForm({
      key: '',
      value: '',
      comment: '',
      isSecret: true,
      folderId: targetFolder,
    });
    setModalVisible(true);
  };

  const openEdit = (item: EnvItem) => {
    if (!canModify(item)) {
      showCustomAlert({
        title: 'Permission Denied',
        message: 'Only the creator of this variable or an admin can edit it.',
        type: 'danger',
      });
      return;
    }
    setEditingId(item.id);
    resetEnvForm({
      key: item.key,
      value: item.value,
      comment: item.comment || '',
      isSecret: item.isSecret,
      folderId: item.folderId || '',
    });
    setModalVisible(true);
  };

  const filteredEnvs = envsList.filter(
    e =>
      e.key.toLowerCase().includes(search.toLowerCase()) ||
      (e.comment && e.comment.toLowerCase().includes(search.toLowerCase())) ||
      (e.folderName && e.folderName.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredFolders = foldersList.filter(
    f =>
      f.name.toLowerCase().includes(folderSearch.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(folderSearch.toLowerCase()))
  );

  const formattedDotEnvExport = filteredEnvs
    .map(e => `${e.key}="${e.value}"`)
    .join('\n');

  const openRawModal = () => {
    const targetFolder =
      selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== 'root'
        ? selectedFolderId
        : '';
    resetRawForm({
      rawDotEnv: formattedDotEnvExport,
      folderId: targetFolder,
    });
    setRawModalVisible(true);
  };

  const activeFolderObj = foldersList.find(f => f.id === selectedFolderId);

  return (
    <View style={styles.container}>
      {/* Vault Status & Sync (shown in Folders view) */}
      {selectedFolderId === null && (
        <View style={styles.syncBar}>
          <View style={styles.vaultSecurityBadge}>
            <Ionicons name="shield-checkmark" size={13} color={COLORS.primary} style={{ marginRight: 5 }} />
            <Text style={styles.vaultSecurityText}>Encrypted Vault</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.syncStatusBadge,
              syncStatus.isSyncing && styles.syncStatusBadgeSyncing,
              syncStatus.pendingCount > 0 && !syncStatus.isSyncing && styles.syncStatusBadgePending,
            ]}
            onPress={() => mobileSyncManager.triggerSync(apiBaseUrl)}
            activeOpacity={0.7}
          >
            {syncStatus.isSyncing ? (
              <>
                <ActivityIndicator size="small" color="#3b82f6" style={{ marginRight: 4 }} />
                <Text style={[styles.syncStatusText, { color: '#3b82f6' }]}>Syncing...</Text>
              </>
            ) : syncStatus.pendingCount > 0 ? (
              <>
                <Ionicons name="cloud-upload-outline" size={12} color="#f59e0b" style={{ marginRight: 4 }} />
                <Text style={[styles.syncStatusText, { color: '#f59e0b' }]}>{syncStatus.pendingCount} pending</Text>
              </>
            ) : (
              <>
                <Ionicons name="cloud-done" size={12} color="#22c55e" style={{ marginRight: 4 }} />
                <Text style={[styles.syncStatusText, { color: '#22c55e' }]}>Synced</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Environment Selector Tabs (shown in Folders view) */}
      {selectedFolderId === null && (
        <View ref={envTabsTargetRef} style={styles.envTabsRow}>
          {(['development', 'staging', 'production'] as const).map(envName => {
            const isActive = environment === envName;
            return (
              <TouchableOpacity
                key={envName}
                style={[styles.envTab, isActive && styles.envTabActive]}
                onPress={() => {
                  setEnvironment(envName);
                  setSelectedFolderId(null);
                }}
              >
                <Text style={[styles.envTabText, isActive && styles.envTabTextActive]}>
                  {envName.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* VIEW 1: FOLDERS VIEW (when selectedFolderId === null) */}
      {selectedFolderId === null ? (
        <View style={{ flex: 1 }}>
          {/* Folders Section Header */}
          <View style={styles.foldersHeader}>
            <View style={styles.foldersHeaderLeft}>
              <Text style={styles.sectionTitle}>FOLDERS</Text>
              <View style={styles.folderCountBadge}>
                <Text style={styles.folderCountText}>{foldersList.length}</Text>
              </View>
            </View>
            <TouchableOpacity
              ref={newFolderBtnTargetRef}
              style={styles.newFolderBtn}
              onPress={openCreateFolder}
              activeOpacity={0.7}
            >
              <Ionicons name="folder-outline" size={13} color={COLORS.secondary} style={{ marginRight: 4 }} />
              <Text style={styles.newFolderBtnText}>+ New Folder</Text>
            </TouchableOpacity>
          </View>

          {/* Search Folders Bar */}
          <View ref={searchBarTargetRef} style={styles.searchBarRow}>
            <Ionicons name="search" size={15} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.folderSearchInput}
              placeholder="Search folders..."
              placeholderTextColor={COLORS.textMuted}
              value={folderSearch}
              onChangeText={setFolderSearch}
            />
            {folderSearch.length > 0 && (
              <TouchableOpacity onPress={() => setFolderSearch('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Folders List or Empty State */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleManualRefresh}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
          >
            {/* Root / Unfiled Folder Tile */}
            <TouchableOpacity
              style={styles.folderCard}
              onPress={() => setSelectedFolderId('root')}
              activeOpacity={0.7}
            >
              <View style={styles.folderCardLeft}>
                <View style={[styles.folderIconBox, { backgroundColor: 'rgba(148, 163, 184, 0.12)' }]}>
                  <Text style={styles.folderIconText}>📄</Text>
                </View>
                <View style={styles.folderCardInfo}>
                  <Text style={styles.folderCardTitle}>Root / Unfiled</Text>
                  <Text style={styles.folderCardDesc} numberOfLines={1}>
                    Standalone environment variables not categorized in any folder
                  </Text>
                </View>
              </View>
              <View style={styles.folderCardRight}>
                <View style={styles.cardCountBadge}>
                  <Text style={styles.cardCountText}>{vaultStats.rootEnvs} keys</Text>
                </View>
                <TouchableOpacity
                  style={styles.folderCardMenuBtn}
                  onPress={(e: any) => {
                    e?.stopPropagation?.();
                    setFolderMenuTarget({
                      id: 'root',
                      name: 'Root / Unfiled',
                      description: 'Standalone environment variables not categorized in any folder',
                      envCount: vaultStats.rootEnvs,
                      folderObj: null,
                      isSpecial: true,
                    });
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                  accessibilityLabel="Options for Root folder"
                >
                  <Ionicons name="ellipsis-vertical" size={17} color={COLORS.textMuted} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} style={{ marginLeft: 2 }} />
              </View>
            </TouchableOpacity>

            {/* Custom Folders */}
            {filteredFolders.map(folder => (
              <TouchableOpacity
                key={folder.id}
                style={styles.folderCard}
                onPress={() => setSelectedFolderId(folder.id)}
                activeOpacity={0.7}
              >
                <View style={styles.folderCardLeft}>
                  <View style={styles.folderIconBox}>
                    <Text style={styles.folderIconText}>📁</Text>
                  </View>
                  <View style={styles.folderCardInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.folderCardTitle}>{folder.name}</Text>
                      {folder.syncStatus && folder.syncStatus !== 'synced' && (
                        <View style={[styles.pendingSyncTag, { marginLeft: 6 }]}>
                          <Ionicons name="time-outline" size={9} color="#f59e0b" style={{ marginRight: 2 }} />
                          <Text style={styles.pendingSyncTagText}>Syncing</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.folderCardDesc} numberOfLines={1}>
                      {folder.description || 'No description provided'}
                    </Text>
                    <View style={styles.folderMetaRow}>
                      <Ionicons name="person-outline" size={11} color={COLORS.textMuted} style={{ marginRight: 3 }} />
                      <Text style={styles.folderCardMeta}>By {folder.createdBy || 'Unknown'}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.folderCardRight}>
                  <View style={styles.cardCountBadge}>
                    <Text style={styles.cardCountText}>{folder.envCount ?? 0} keys</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.folderCardMenuBtn}
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      setFolderMenuTarget({
                        id: folder.id,
                        name: folder.name,
                        description: folder.description,
                        envCount: folder.envCount ?? 0,
                        folderObj: folder,
                      });
                    }}
                    hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                    accessibilityLabel={`Options for ${folder.name}`}
                  >
                    <Ionicons name="ellipsis-vertical" size={17} color={COLORS.textMuted} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} style={{ marginLeft: 2 }} />
                </View>
              </TouchableOpacity>
            ))}

            {/* Empty state if no custom folders */}
            {foldersList.length === 0 && (
              <View style={styles.emptyFolderBox}>
                <Text style={styles.emptyFolderIcon}>📂</Text>
                <Text style={styles.emptyFolderTitle}>No Custom Folders Yet</Text>
                <Text style={styles.emptyFolderText}>
                  Create folders to organize your variables (e.g. Backend API, Stripe, Mobile App).
                </Text>
                <TouchableOpacity
                  style={styles.createFolderPrimaryBtn}
                  onPress={openCreateFolder}
                >
                  <Ionicons name="add" size={16} color="#000" style={{ marginRight: 4 }} />
                  <Text style={styles.createFolderPrimaryBtnText}>Create First Folder</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 3. All Variables Card */}
            <TouchableOpacity
              style={[styles.folderCard, styles.allEnvsCard]}
              onPress={() => setSelectedFolderId('all')}
              activeOpacity={0.7}
            >
              <View style={styles.folderCardLeft}>
                <View style={[styles.folderIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <Text style={styles.folderIconText}>🗄️</Text>
                </View>
                <View style={styles.folderCardInfo}>
                  <Text style={styles.folderCardTitle}>All Variables</Text>
                  <Text style={styles.folderCardDesc}>View all variables across all folders</Text>
                </View>
              </View>
              <View style={styles.folderCardRight}>
                <View style={[styles.cardCountBadge, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                  <Text style={[styles.cardCountText, { color: '#818cf8' }]}>{vaultStats.totalEnvs} keys</Text>
                </View>
                <TouchableOpacity
                  style={styles.folderCardMenuBtn}
                  onPress={(e: any) => {
                    e?.stopPropagation?.();
                    setFolderMenuTarget({
                      id: 'all',
                      name: 'All Variables',
                      description: 'All variables across all folders',
                      envCount: vaultStats.totalEnvs,
                      folderObj: null,
                      isSpecial: true,
                    });
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                  accessibilityLabel="Options for All Variables"
                >
                  <Ionicons name="ellipsis-vertical" size={17} color={COLORS.textMuted} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} style={{ marginLeft: 2 }} />
              </View>
            </TouchableOpacity>
          </ScrollView>

          {/* Redesigned Vault Bottom Actions Dock */}
          <View ref={footerDockTargetRef} style={styles.vaultFooterDock}>
            {/* 1. Add Key Action */}
            <TouchableOpacity
              ref={footerAddKeyTargetRef}
              style={styles.dockActionBtn}
              onPress={() => openAdd('')}
              activeOpacity={0.65}
              accessibilityLabel="Add new environment variable"
            >
              <View style={[styles.dockIconBadge, styles.dockIconBadgeEmerald]}>
                <Ionicons name="add" size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.dockActionLabel} numberOfLines={1}>
                Add Key
              </Text>
            </TouchableOpacity>

            {/* 2. New Folder Action */}
            <TouchableOpacity
              ref={footerNewFolderTargetRef}
              style={styles.dockActionBtn}
              onPress={openCreateFolder}
              activeOpacity={0.65}
              accessibilityLabel="Create new folder"
            >
              <View style={[styles.dockIconBadge, styles.dockIconBadgeCyan]}>
                <Ionicons name="folder-outline" size={18} color={COLORS.secondary} />
              </View>
              <Text style={styles.dockActionLabel} numberOfLines={1}>
                New Folder
              </Text>
            </TouchableOpacity>

            {/* 3. Import .env Action */}
            <TouchableOpacity
              ref={footerImportEnvTargetRef}
              style={styles.dockActionBtn}
              onPress={openRawModal}
              activeOpacity={0.65}
              accessibilityLabel="Import raw dot env"
            >
              <View style={[styles.dockIconBadge, styles.dockIconBadgePurple]}>
                <Ionicons name="cloud-upload-outline" size={18} color="#a78bfa" />
              </View>
              <Text style={styles.dockActionLabel} numberOfLines={1}>
                Import .env
              </Text>
            </TouchableOpacity>

            {/* 4. Backup Vault Action */}
            <TouchableOpacity
              ref={footerBackupTargetRef}
              style={styles.dockActionBtn}
              onPress={() => openExportModal(null)}
              activeOpacity={0.65}
              accessibilityLabel="Backup vault environments as zip archive"
            >
              <View style={[styles.dockIconBadge, styles.dockIconBadgeAmber]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#f59e0b" />
              </View>
              <Text style={styles.dockActionLabel} numberOfLines={1}>
                Backup
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ================= 2. VARIABLES VIEW (INSIDE A FOLDER) ================= */
        <View style={{ flex: 1 }}>
          {/* Breadcrumb Navigation Trail */}
          <View style={styles.breadcrumbBar}>
            <TouchableOpacity
              style={styles.breadcrumbItem}
              onPress={() => setSelectedFolderId(null)}
              activeOpacity={0.7}
              accessibilityLabel="Back to folders"
            >
              <Ionicons name="chevron-back" size={14} color={COLORS.primary} style={{ marginRight: 2 }} />
              <Ionicons name="folder-outline" size={14} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.breadcrumbLinkText}>Folders</Text>
            </TouchableOpacity>

            <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} style={styles.breadcrumbSeparator} />

            <View style={styles.breadcrumbCurrentItem}>
              <Text style={styles.breadcrumbCurrentIcon}>
                {selectedFolderId === 'root' ? '📄' : selectedFolderId === 'all' ? '🗄️' : '📁'}
              </Text>
              <Text style={styles.breadcrumbCurrentText} numberOfLines={1}>
                {selectedFolderId === 'root'
                  ? 'Root / Unfiled'
                  : selectedFolderId === 'all'
                  ? 'All Variables'
                  : activeFolderObj?.name || 'Folder'}
              </Text>
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              style={[
                styles.syncStatusBadge,
                syncStatus.isSyncing && styles.syncStatusBadgeSyncing,
                syncStatus.pendingCount > 0 && !syncStatus.isSyncing && styles.syncStatusBadgePending,
                { marginRight: 8 },
              ]}
              onPress={() => mobileSyncManager.triggerSync(apiBaseUrl)}
              activeOpacity={0.7}
            >
              {syncStatus.isSyncing ? (
                <>
                  <ActivityIndicator size="small" color="#3b82f6" style={{ marginRight: 4 }} />
                  <Text style={[styles.syncStatusText, { color: '#3b82f6' }]}>Syncing...</Text>
                </>
              ) : syncStatus.pendingCount > 0 ? (
                <>
                  <Ionicons name="cloud-upload-outline" size={12} color="#f59e0b" style={{ marginRight: 4 }} />
                  <Text style={[styles.syncStatusText, { color: '#f59e0b' }]}>{syncStatus.pendingCount}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-done" size={12} color="#22c55e" style={{ marginRight: 4 }} />
                  <Text style={[styles.syncStatusText, { color: '#22c55e' }]}>Synced</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.breadcrumbEnvBadge}>
              <Text style={styles.breadcrumbEnvText}>{environment.toUpperCase()}</Text>
            </View>
          </View>

          {/* Active Folder Header Card */}
          <View style={styles.folderDetailsCard}>
            <View style={styles.folderDetailsCardTop}>
              <View style={styles.folderDetailsTitleGroup}>
                <Text style={styles.folderDetailsIcon}>
                  {selectedFolderId === 'root' ? '📄' : selectedFolderId === 'all' ? '🗄️' : '📁'}
                </Text>
                <Text style={styles.folderDetailsTitle} numberOfLines={1}>
                  {selectedFolderId === 'root'
                    ? 'Root / Unfiled'
                    : selectedFolderId === 'all'
                    ? 'All Variables'
                    : activeFolderObj?.name || 'Folder'}
                </Text>
                <View style={styles.activeFolderBadge}>
                  <Text style={styles.activeFolderBadgeText}>
                    {filteredEnvs.length} {filteredEnvs.length === 1 ? 'key' : 'keys'}
                  </Text>
                </View>
              </View>

              <View style={styles.bannerFolderActionsRow}>
                <TouchableOpacity
                  style={styles.folderCardMenuBtn}
                  onPress={() => {
                    if (selectedFolderId === 'root') {
                      setFolderMenuTarget({
                        id: 'root',
                        name: 'Root / Unfiled',
                        description: 'Standalone environment variables not categorized in any folder',
                        envCount: filteredEnvs.length,
                        folderObj: null,
                        isSpecial: true,
                      });
                    } else if (selectedFolderId === 'all') {
                      setFolderMenuTarget({
                        id: 'all',
                        name: 'All Variables',
                        description: 'All variables across all folders',
                        envCount: filteredEnvs.length,
                        folderObj: null,
                        isSpecial: true,
                      });
                    } else if (activeFolderObj) {
                      setFolderMenuTarget({
                        id: activeFolderObj.id,
                        name: activeFolderObj.name,
                        description: activeFolderObj.description,
                        envCount: filteredEnvs.length,
                        folderObj: activeFolderObj,
                      });
                    }
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                  activeOpacity={0.7}
                  accessibilityLabel="Folder options"
                >
                  <Ionicons name="ellipsis-vertical" size={17} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {activeFolderObj?.description ? (
              <Text style={styles.folderDetailsDesc}>{activeFolderObj.description}</Text>
            ) : null}
          </View>

          {/* Filter & Actions Bar */}
          <View style={styles.actionRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Filter variables in folder..."
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => openAdd(selectedFolderId === 'root' ? '' : selectedFolderId)}
            >
              <Text style={styles.addBtnText}>+ Add Key</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bulkBtn}
              onPress={openRawModal}
            >
              <Text style={styles.bulkBtnText}>📄 .env</Text>
            </TouchableOpacity>
          </View>

          {/* Envs Items List */}
          {loading ? (
            <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
              <EnvsListSkeleton count={4} />
            </ScrollView>
          ) : filteredEnvs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>
                {activeFolderObj
                  ? `No Variables in "${activeFolderObj.name}"`
                  : selectedFolderId === 'root'
                  ? 'No Unfiled Variables'
                  : 'No Environment Variables'}
              </Text>
              <Text style={styles.emptyText}>
                {activeFolderObj
                  ? `Add your first key to "${activeFolderObj.name}" using the button below.`
                  : `No variables found in this location.`}
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => openAdd(selectedFolderId === 'root' ? '' : selectedFolderId)}
              >
                <Text style={styles.emptyAddBtnText}>
                  {activeFolderObj ? `+ Add Key to ${activeFolderObj.name}` : '+ Add Key'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleManualRefresh}
                  tintColor={COLORS.primary}
                  colors={[COLORS.primary]}
                />
              }
            >
              {filteredEnvs.map(item => {
                const isRevealed = revealedIds[item.id];
                const displayValue = item.isSecret && !isRevealed ? '••••••••••••••••' : item.value;

                return (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.keyBadgeContainer}>
                        <Text style={styles.keyName}>{item.key}</Text>
                        {item.syncStatus && item.syncStatus !== 'synced' && (
                          <View style={[styles.pendingSyncTag, { marginLeft: 4 }]}>
                            <Ionicons name="time-outline" size={9} color="#f59e0b" style={{ marginRight: 2 }} />
                            <Text style={styles.pendingSyncTagText}>Syncing</Text>
                          </View>
                        )}
                        {item.isSecret && (
                          <View style={styles.secretTag}>
                            <Text style={styles.secretTagText}>SECRET</Text>
                          </View>
                        )}
                        {item.folderName && selectedFolderId === 'all' && (
                          <View style={styles.folderTag}>
                            <Text style={styles.folderTagText}>📁 {item.folderName}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.cardActions}>
                        {item.isSecret && (
                          <TouchableOpacity
                            style={styles.actionIconBtn}
                            onPress={() => toggleReveal(item.id)}
                          >
                            <Text style={styles.actionIconText}>
                              {isRevealed ? '🙈' : '👁️'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {canModify(item) && (
                          <>
                            <TouchableOpacity
                              style={styles.actionIconBtn}
                              onPress={() => openEdit(item)}
                              accessibilityLabel="Edit variable"
                            >
                              <Text style={styles.actionIconText}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.actionIconBtn}
                              onPress={() => handleDelete(item.id, item.key)}
                              accessibilityLabel="Delete variable"
                            >
                              <Text style={styles.actionIconText}>🗑️</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>

                    {/* Value Box */}
                    <View style={styles.valueBox}>
                      <Text style={styles.valueText} numberOfLines={2}>
                        {displayValue}
                      </Text>
                    </View>

                    {item.comment ? (
                      <Text style={styles.commentText}>💡 {item.comment}</Text>
                    ) : null}

                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>By {item.createdBy}</Text>
                      <Text style={styles.metaText}>
                        {item.folderName ? `📁 ${item.folderName}` : 'Root Vault'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Create / Edit Folder Modal */}
      <Modal visible={folderModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {editingFolderId ? '📁 Edit Folder' : '📁 Create New Folder'}
              </Text>
              <TouchableOpacity onPress={() => setFolderModalVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              {editingFolderId
                ? 'Update this folder name and description.'
                : 'Organize your environment variables hierarchically into folders.'}
            </Text>

            <Text style={styles.modalLabel}>Folder Name</Text>
            <Controller
              control={folderControl}
              name="name"
              rules={{
                required: 'Folder name is required (e.g. Backend API, Stripe Config)',
                minLength: { value: 2, message: 'Must be at least 2 characters' },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.modalInput, folderErrors.name && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Backend API, AWS Config"
                  placeholderTextColor={COLORS.textMuted}
                  autoFocus
                />
              )}
            />
            {folderErrors.name && (
              <Text style={styles.errorText}>{folderErrors.name.message}</Text>
            )}

            <Text style={styles.modalLabel}>Description (Optional)</Text>
            <Controller
              control={folderControl}
              name="description"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={styles.modalInput}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Microservices, Payment Gateways"
                  placeholderTextColor={COLORS.textMuted}
                />
              )}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setFolderModalVisible(false);
                  resetFolderForm();
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtnSecondary}
                onPress={handleFolderSubmit(onSaveFolder)}
                disabled={savingFolder}
              >
                {savingFolder ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingFolderId ? 'Save Changes' : 'Create Folder'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add / Edit Variable Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Variable' : 'Add New Variable'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Folder Selection Picker */}
            <Text style={styles.modalLabel}>Folder Location</Text>
            <Controller
              control={envControl}
              name="folderId"
              render={({ field: { onChange, value } }) => (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderPickerScroll}>
                  <TouchableOpacity
                    style={[styles.pickerChip, !value && styles.pickerChipActive]}
                    onPress={() => onChange('')}
                  >
                    <Text style={[styles.pickerChipText, !value && styles.pickerChipTextActive]}>
                      📄 Root / Unassigned
                    </Text>
                  </TouchableOpacity>
                  {foldersList.map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.pickerChip, value === f.id && styles.pickerChipActive]}
                      onPress={() => onChange(f.id)}
                    >
                      <Text style={[styles.pickerChipText, value === f.id && styles.pickerChipTextActive]}>
                        📁 {f.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            />

            <Text style={styles.modalLabel}>Key Name</Text>
            <Controller
              control={envControl}
              name="key"
              rules={{
                required: 'Key name is required (e.g. DATABASE_URL)',
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.modalInput, envErrors.key && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. DATABASE_URL"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="characters"
                />
              )}
            />
            {envErrors.key && (
              <Text style={styles.errorText}>{envErrors.key.message}</Text>
            )}

            <Text style={styles.modalLabel}>Secret Value</Text>
            <Controller
              control={envControl}
              name="value"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.modalInput, styles.modalInputMulti]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Enter variable value..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                />
              )}
            />

            <Text style={styles.modalLabel}>Comment / Description</Text>
            <Controller
              control={envControl}
              name="comment"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={styles.modalInput}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Usage notes..."
                  placeholderTextColor={COLORS.textMuted}
                />
              )}
            />

            <Controller
              control={envControl}
              name="isSecret"
              render={({ field: { onChange, value } }) => (
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => onChange(!value)}
                >
                  <View style={[styles.checkbox, value && styles.checkboxChecked]}>
                    {value && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Mask as Sensitive Secret</Text>
                </TouchableOpacity>
              )}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleEnvSubmit(onSaveEnv)}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Variable</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bulk Raw DotEnv Export / Import Modal */}
      <Modal visible={rawModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>📄 Raw .env Bulk Parser</Text>
              <TouchableOpacity onPress={() => setRawModalVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Paste raw .env content below to bulk import into vault.
            </Text>

            {/* Folder Target Picker for Bulk Import */}
            <Text style={styles.modalLabel}>Import Into Folder</Text>
            <Controller
              control={rawControl}
              name="folderId"
              render={({ field: { onChange, value } }) => (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderPickerScroll}>
                  <TouchableOpacity
                    style={[styles.pickerChip, !value && styles.pickerChipActive]}
                    onPress={() => onChange('')}
                  >
                    <Text style={[styles.pickerChipText, !value && styles.pickerChipTextActive]}>
                      📄 Root / Unassigned
                    </Text>
                  </TouchableOpacity>
                  {foldersList.map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.pickerChip, value === f.id && styles.pickerChipActive]}
                      onPress={() => onChange(f.id)}
                    >
                      <Text style={[styles.pickerChipText, value === f.id && styles.pickerChipTextActive]}>
                        📁 {f.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            />

            <Controller
              control={rawControl}
              name="rawDotEnv"
              rules={{
                required: 'Raw .env text is required',
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.modalInput, { height: 140 }, rawErrors.rawDotEnv && styles.inputError]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={`KEY_1=value1\nKEY_2=value2`}
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                />
              )}
            />
            {rawErrors.rawDotEnv && (
              <Text style={styles.errorText}>{rawErrors.rawDotEnv.message}</Text>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRawModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleRawSubmit(onImportBulk)}
                disabled={submitting}
              >
                <Text style={styles.saveBtnText}>Import into Vault</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Folder Action Sheet / Menu Modal */}
      <Modal
        visible={!!folderMenuTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setFolderMenuTarget(null)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setFolderMenuTarget(null)}
        >
          <View
            style={styles.menuSheetCard}
            onStartShouldSetResponder={() => true}
          >
            {/* Grabber indicator */}
            <View style={styles.sheetHandleBar} />

            {/* Folder Header */}
            <View style={styles.menuHeaderRow}>
              <View style={styles.menuHeaderIconBox}>
                <Text style={{ fontSize: 20 }}>
                  {folderMenuTarget?.id === 'root'
                    ? '📄'
                    : folderMenuTarget?.id === 'all'
                    ? '🗄️'
                    : '📁'}
                </Text>
              </View>
              <View style={styles.menuHeaderTextCol}>
                <Text style={styles.menuHeaderTitle} numberOfLines={1}>
                  {folderMenuTarget?.name}
                </Text>
                <Text style={styles.menuHeaderSubtitle} numberOfLines={1}>
                  {folderMenuTarget?.envCount ?? 0} {folderMenuTarget?.envCount === 1 ? 'variable' : 'variables'}
                  {folderMenuTarget?.folderObj?.createdBy ? ` • By ${folderMenuTarget.folderObj.createdBy}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.menuCloseBtn}
                onPress={() => setFolderMenuTarget(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.menuDivider} />

            {/* Menu Options */}
            <View style={styles.menuOptionsList}>
              {/* Option 1: Backup to .zip */}
              <TouchableOpacity
                style={styles.menuOptionItem}
                onPress={() => {
                  const targetId = folderMenuTarget?.id;
                  setFolderMenuTarget(null);
                  openExportModal(targetId === 'all' ? null : targetId);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
                </View>
                <View style={styles.menuOptionTextCol}>
                  <Text style={styles.menuOptionTitle}>Backup to .zip</Text>
                  <Text style={styles.menuOptionSubtitle}>
                    Download variables directly to device storage
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              {/* Option 2: Edit Folder (if custom folder & user has permission) */}
              {folderMenuTarget?.folderObj && canModify(folderMenuTarget.folderObj) && (
                <TouchableOpacity
                  style={styles.menuOptionItem}
                  onPress={() => {
                    const obj = folderMenuTarget.folderObj!;
                    setFolderMenuTarget(null);
                    openEditFolder(obj);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                    <Ionicons name="pencil-outline" size={18} color={COLORS.secondary} />
                  </View>
                  <View style={styles.menuOptionTextCol}>
                    <Text style={styles.menuOptionTitle}>Edit Folder</Text>
                    <Text style={styles.menuOptionSubtitle}>
                      Rename folder or change its description
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}

              {/* Option 3: Delete Folder (if custom folder & user has permission) */}
              {folderMenuTarget?.folderObj && canModify(folderMenuTarget.folderObj) && (
                <TouchableOpacity
                  style={[styles.menuOptionItem, styles.menuOptionItemDanger]}
                  onPress={() => {
                    const obj = folderMenuTarget.folderObj!;
                    setFolderMenuTarget(null);
                    handleDeleteFolder(obj);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuOptionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                  </View>
                  <View style={styles.menuOptionTextCol}>
                    <Text style={[styles.menuOptionTitle, { color: COLORS.danger }]}>Delete Folder</Text>
                    <Text style={styles.menuOptionSubtitle}>
                      Variables inside will be moved to Root (Unfiled)
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.danger} />
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.menuCancelBtn}
              onPress={() => setFolderMenuTarget(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Export Envs ZIP Modal */}
      <ExportEnvsModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        workspaceId={workspaceId}
        teamId={teamId}
        teamName={team?.name}
        environment={environment}
        folders={foldersList}
        rootCount={vaultStats.rootEnvs}
        initialFolderId={exportTargetFolderId}
        apiBaseUrl={apiBaseUrl}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 16,
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  vaultSecurityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vaultSecurityText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  syncStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  syncStatusBadgeSyncing: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  syncStatusBadgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  syncStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pendingSyncTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  pendingSyncTagText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  envTabsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  envTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  envTabActive: {
    backgroundColor: COLORS.primary,
  },
  envTabText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  envTabTextActive: {
    color: '#000',
    fontWeight: '800',
  },

  // Folders View Styles
  foldersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  foldersHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginRight: 8,
  },
  folderCountBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  folderCountText: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '800',
  },
  navRefreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  newFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.secondaryGlow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  newFolderBtnText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  folderSearchInput: {
    flex: 1,
    paddingVertical: 9,
    color: COLORS.text,
    fontSize: 13,
  },
  foldersListContent: {
    paddingBottom: 20,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  allEnvsCard: {
    borderStyle: 'dashed',
    borderColor: 'rgba(99, 102, 241, 0.4)',
    marginTop: 4,
  },
  folderCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  folderIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: COLORS.secondaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  folderIconText: {
    fontSize: 20,
  },
  folderCardInfo: {
    flex: 1,
  },
  folderCardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  folderCardDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  folderCardMeta: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  folderCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardCountBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardCountText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  folderCardMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  folderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  emptyFolderBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
    marginVertical: 12,
  },
  emptyFolderIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyFolderTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyFolderText: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  createFolderPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createFolderPrimaryBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 12,
  },
  vaultFooterDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#121217',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 10,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  dockActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dockIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
  },
  dockIconBadgeEmerald: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  dockIconBadgeCyan: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  dockIconBadgePurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  dockIconBadgeAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  dockActionLabel: {
    color: '#e4e4e7',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },

  // Breadcrumb Navigation Bar Styles
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  breadcrumbLinkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  breadcrumbSeparator: {
    marginHorizontal: 4,
  },
  breadcrumbCurrentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: 160,
  },
  breadcrumbCurrentIcon: {
    fontSize: 13,
    marginRight: 5,
  },
  breadcrumbCurrentText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  breadcrumbEnvBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  breadcrumbEnvText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Folder Details Card
  folderDetailsCard: {
    backgroundColor: 'rgba(6, 182, 212, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  folderDetailsCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  folderDetailsTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  folderDetailsIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  folderDetailsTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
    marginRight: 8,
    flexShrink: 1,
  },
  activeFolderBadge: {
    backgroundColor: COLORS.secondary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeFolderBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },
  folderDetailsDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  bannerFolderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Folder Picker in Modals
  folderPickerScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  pickerChip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerChipActive: {
    backgroundColor: COLORS.secondaryGlow,
    borderColor: COLORS.secondary,
  },
  pickerChipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  pickerChipTextActive: {
    color: COLORS.secondary,
    fontWeight: '700',
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: COLORS.text,
    fontSize: 13,
    marginRight: 8,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 6,
  },
  addBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 12,
  },
  bulkBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 6,
  },
  bulkBtnText: {
    color: COLORS.textSubtle,
    fontWeight: '700',
    fontSize: 12,
  },
  dbInspectBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  dbInspectBtnText: {
    color: COLORS.secondary,
    fontWeight: '800',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 240,
    marginBottom: 16,
  },
  emptyAddBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyAddBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 12,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  keyBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  keyName: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 8,
  },
  secretTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.danger,
    marginRight: 6,
  },
  secretTagText: {
    color: COLORS.danger,
    fontSize: 9,
    fontWeight: '800',
  },
  folderTag: {
    backgroundColor: COLORS.secondaryGlow,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  folderTagText: {
    color: COLORS.secondary,
    fontSize: 9,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
  },
  actionIconBtn: {
    padding: 6,
    marginLeft: 4,
  },
  actionIconText: {
    fontSize: 14,
  },
  valueBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 6,
  },
  valueText: {
    color: COLORS.textSubtle,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  commentText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    marginTop: 2,
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: 10,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSubtle,
    marginBottom: 6,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 4,
  },
  modalInputMulti: {
    height: 70,
    textAlignVertical: 'top',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
  },
  checkboxLabel: {
    color: COLORS.textSubtle,
    fontSize: 13,
  },
  modalBtnRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnSecondary: {
    flex: 1,
    backgroundColor: COLORS.secondary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#000',
    fontWeight: '800',
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 11,
    marginTop: -2,
    marginBottom: 6,
  },

  // Folder Menu Action Sheet Modal
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  menuSheetCard: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  sheetHandleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  menuHeaderIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuHeaderTextCol: {
    flex: 1,
  },
  menuHeaderTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  menuHeaderSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  menuCloseBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  menuOptionsList: {
    gap: 10,
    marginBottom: 16,
  },
  menuOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  menuOptionItemDanger: {
    borderColor: 'rgba(239, 68, 68, 0.25)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  menuOptionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuOptionTextCol: {
    flex: 1,
  },
  menuOptionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  menuOptionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  menuCancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  menuCancelText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
