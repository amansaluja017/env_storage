import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme';
import { FolderItem, exportMobileEnvsZip, saveOrShareZip } from '../storage/mobileSqlite';
import { showCustomAlert } from './CustomAlert';

export interface ExportEnvsModalProps {
  visible: boolean;
  onClose: () => void;
  workspaceId: string;
  teamId: string;
  teamName?: string;
  environment: 'development' | 'staging' | 'production';
  folders: FolderItem[];
  rootCount: number;
  initialFolderId?: string | null;
  apiBaseUrl?: string;
}

export function ExportEnvsModal({
  visible,
  onClose,
  workspaceId,
  teamId,
  teamName,
  environment,
  folders,
  rootCount,
  initialFolderId,
  apiBaseUrl,
}: ExportEnvsModalProps) {
  const [mode, setMode] = useState<'all' | 'custom'>('all');
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Initialize selection when modal opens or initialFolderId changes
  useEffect(() => {
    if (!visible) return;

    if (initialFolderId !== undefined && initialFolderId !== null) {
      // Pre-select the single folder or root
      setMode('custom');
      setSelectedFolderIds(new Set([initialFolderId]));
    } else {
      // Default to all folders
      setMode('all');
      const allIds = new Set(folders.map(f => f.id));
      if (rootCount > 0) {
        allIds.add('root');
      }
      setSelectedFolderIds(allIds);
    }
  }, [visible, initialFolderId, folders, rootCount]);

  const toggleFolder = (id: string) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = new Set(folders.map(f => f.id));
    if (rootCount > 0) {
      allIds.add('root');
    }
    setSelectedFolderIds(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedFolderIds(new Set());
  };

  // Compute targeted items for preview & calculation
  const targetFolders = useMemo(() => {
    if (mode === 'all') {
      return folders;
    }
    return folders.filter(f => selectedFolderIds.has(f.id));
  }, [mode, folders, selectedFolderIds]);

  const includeRoot = useMemo(() => {
    if (mode === 'all') {
      return rootCount > 0;
    }
    return selectedFolderIds.has('root');
  }, [mode, rootCount, selectedFolderIds]);

  const totalVariables = useMemo(() => {
    const folderVars = targetFolders.reduce((sum, f) => sum + (f.envCount || 0), 0);
    const rootVars = includeRoot ? rootCount : 0;
    return folderVars + rootVars;
  }, [targetFolders, includeRoot, rootCount]);

  const totalFoldersCount = useMemo(() => {
    return targetFolders.length + (includeRoot ? 1 : 0);
  }, [targetFolders, includeRoot]);

  const teamNameSlug = useMemo(() => {
    return (teamName || 'team')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_');
  }, [teamName]);

  const estimatedFileName = useMemo(() => {
    if (mode === 'custom' && selectedFolderIds.size === 1) {
      const singleId = Array.from(selectedFolderIds)[0];
      if (singleId === 'root') {
        return `env_vault_${teamNameSlug}_root_${environment}.zip`;
      }
      const found = folders.find(f => f.id === singleId);
      const folderSlug = (found?.name || 'folder')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_');
      return `env_vault_${teamNameSlug}_${folderSlug}_${environment}.zip`;
    }
    return `env_vault_${teamNameSlug}_${environment}_envs.zip`;
  }, [mode, selectedFolderIds, folders, teamNameSlug, environment]);

  const handleExport = async () => {
    if (mode === 'custom' && totalFoldersCount === 0) {
      showCustomAlert({
        title: 'No Folders Selected',
        message: 'Please select at least one folder or root to download.',
        type: 'warning',
      });
      return;
    }

    setExporting(true);
    try {
      const folderIdsParam = mode === 'all' ? null : Array.from(selectedFolderIds);
      const res = await exportMobileEnvsZip({
        workspaceId,
        teamId,
        environment,
        folderIds: folderIdsParam,
        teamName,
        apiBaseUrl,
      });

      await saveOrShareZip(res.fileName, res.base64);

      onClose();
      showCustomAlert({
        title: 'Backup Complete! 🎉',
        message: `Saved backup ${res.fileName} with ${res.folderCount} ${res.folderCount === 1 ? 'folder' : 'folders'} (${res.envCount} variables) directly to your device storage.`,
        type: 'success',
      });
    } catch (err: any) {
      // If user cancelled folder picker, silently return without error alert
      if (
        err?.message?.includes('granted') ||
        err?.message?.includes('denied') ||
        err?.message?.includes('permission') ||
        err?.message?.includes('cancel')
      ) {
        return;
      }
      showCustomAlert({
        title: 'Backup Failed',
        message: err?.message || 'Unable to download backup zip archive.',
        type: 'danger',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIconBox}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.modalTitle}>Vault Backup (.zip)</Text>
                <Text style={styles.modalSubtitle}>
                  {teamName || 'Team'} • {environment.toUpperCase()}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close export modal"
            >
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'all' && styles.modeTabActive]}
              onPress={() => setMode('all')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="albums-outline"
                size={14}
                color={mode === 'all' ? COLORS.primary : COLORS.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeTabText, mode === 'all' && styles.modeTabTextActive]}>
                All Folders
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, mode === 'custom' && styles.modeTabActive]}
              onPress={() => setMode('custom')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="checkbox-outline"
                size={14}
                color={mode === 'custom' ? COLORS.secondary : COLORS.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeTabText, mode === 'custom' && styles.modeTabTextActive]}>
                Select Folders
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {/* Custom Selection Folder Checklist */}
            {mode === 'custom' && (
              <View style={styles.selectionSection}>
                <View style={styles.selectionHeader}>
                  <Text style={styles.selectionCountText}>
                    Selected ({selectedFolderIds.size} / {folders.length + (rootCount > 0 ? 1 : 0)})
                  </Text>
                  <View style={styles.selectionActions}>
                    <TouchableOpacity onPress={handleSelectAll} style={styles.selectionActionBtn}>
                      <Text style={styles.selectionActionText}>Select All</Text>
                    </TouchableOpacity>
                    <Text style={styles.selectionDivider}>•</Text>
                    <TouchableOpacity onPress={handleDeselectAll} style={styles.selectionActionBtn}>
                      <Text style={styles.selectionActionText}>Deselect</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Root / Unfiled Option */}
                <TouchableOpacity
                  style={[
                    styles.folderCheckItem,
                    selectedFolderIds.has('root') && styles.folderCheckItemActive,
                  ]}
                  onPress={() => toggleFolder('root')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={selectedFolderIds.has('root') ? 'checkbox' : 'square-outline'}
                    size={19}
                    color={selectedFolderIds.has('root') ? COLORS.primary : COLORS.textMuted}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={styles.folderItemIcon}>📄</Text>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.folderItemName}>Root / Unfiled</Text>
                    <Text style={styles.folderItemSub}>Independent keys not in any folder</Text>
                  </View>
                  <View style={styles.folderItemBadge}>
                    <Text style={styles.folderItemBadgeText}>{rootCount} keys</Text>
                  </View>
                </TouchableOpacity>

                {/* Custom Folders */}
                {folders.map(f => {
                  const isChecked = selectedFolderIds.has(f.id);
                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[
                        styles.folderCheckItem,
                        isChecked && styles.folderCheckItemActive,
                      ]}
                      onPress={() => toggleFolder(f.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isChecked ? 'checkbox' : 'square-outline'}
                        size={19}
                        color={isChecked ? COLORS.secondary : COLORS.textMuted}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={styles.folderItemIcon}>📁</Text>
                      <View style={{ flex: 1, marginLeft: 6 }}>
                        <Text style={styles.folderItemName}>{f.name}</Text>
                        <Text style={styles.folderItemSub} numberOfLines={1}>
                          {f.description || `Created by ${f.createdBy}`}
                        </Text>
                      </View>
                      <View style={styles.folderItemBadge}>
                        <Text style={styles.folderItemBadgeText}>{f.envCount ?? 0} keys</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Archive Layout Preview */}
            <View style={styles.previewBox}>
              <View style={styles.previewHeader}>
                <Ionicons name="code-slash-outline" size={14} color={COLORS.secondary} style={{ marginRight: 6 }} />
                <Text style={styles.previewHeaderText}>ARCHIVE STRUCTURE PREVIEW</Text>
              </View>
              <View style={styles.treeContainer}>
                <View style={styles.treeRootLine}>
                  <Ionicons name="archive" size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.treeArchiveName} numberOfLines={1}>
                    {estimatedFileName}
                  </Text>
                </View>

                {targetFolders.map((f, idx) => {
                  const isLast = idx === targetFolders.length - 1 && !includeRoot;
                  return (
                    <View key={f.id} style={styles.treeBranchLine}>
                      <Text style={styles.treeBranchGlyph}>{isLast ? '└──' : '├──'}</Text>
                      <Ionicons name="folder-open" size={13} color="#f59e0b" style={{ marginHorizontal: 4 }} />
                      <Text style={styles.treeItemText} numberOfLines={1}>
                        {f.name}/.env
                      </Text>
                      <Text style={styles.treeItemCount}>
                        ({f.envCount ?? 0} {f.envCount === 1 ? 'var' : 'vars'})
                      </Text>
                    </View>
                  );
                })}

                {includeRoot && (
                  <View style={styles.treeBranchLine}>
                    <Text style={styles.treeBranchGlyph}>└──</Text>
                    <Ionicons name="document-text" size={13} color="#94a3b8" style={{ marginHorizontal: 4 }} />
                    <Text style={styles.treeItemText}>root/.env</Text>
                    <Text style={styles.treeItemCount}>
                      ({rootCount} {rootCount === 1 ? 'var' : 'vars'})
                    </Text>
                  </View>
                )}

                {totalFoldersCount === 0 && (
                  <View style={styles.treeBranchLine}>
                    <Text style={styles.treeBranchGlyph}>└──</Text>
                    <Text style={styles.treeEmptyText}>No folders selected</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Overview Summary Cards */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{totalFoldersCount}</Text>
                <Text style={styles.statLabel}>Folders</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{totalVariables}</Text>
                <Text style={styles.statLabel}>Variables</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>ZIP</Text>
                <Text style={styles.statLabel}>Standard .env</Text>
              </View>
            </View>

            <Text style={styles.platformHelpText}>
              {Platform.OS === 'web'
                ? '💻 Web: Direct browser download of the .zip file.'
                : '📱 Mobile: Downloads the .zip file directly to your device storage (e.g. Downloads folder).'}
            </Text>
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={exporting}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.exportBtn,
                (exporting || totalFoldersCount === 0) && styles.exportBtnDisabled,
              ]}
              onPress={handleExport}
              disabled={exporting || totalFoldersCount === 0}
              activeOpacity={0.8}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="download" size={17} color="#000" style={{ marginRight: 6 }} />
                  <Text style={styles.exportBtnText}>Download Backup (.zip)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    padding: 20,
    ...SHADOWS.card,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: COLORS.cardHover,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  modeTabTextActive: {
    color: COLORS.text,
  },
  scrollArea: {
    maxHeight: 400,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  selectionSection: {
    marginBottom: 14,
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  selectionCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSubtle,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionActionBtn: {
    paddingVertical: 2,
  },
  selectionActionText: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: '500',
  },
  selectionDivider: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  folderCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 6,
  },
  folderCheckItemActive: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  folderItemIcon: {
    fontSize: 16,
  },
  folderItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  folderItemSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  folderItemBadge: {
    backgroundColor: COLORS.cardHover,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  folderItemBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSubtle,
  },
  previewBox: {
    backgroundColor: '#0c0d10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f242d',
    padding: 12,
    marginBottom: 14,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: COLORS.secondary,
  },
  treeContainer: {
    paddingLeft: 4,
  },
  treeRootLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  treeArchiveName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  treeBranchLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingLeft: 4,
  },
  treeBranchGlyph: {
    fontSize: 12,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 2,
  },
  treeItemText: {
    fontSize: 12,
    color: COLORS.textSubtle,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  treeItemCount: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginLeft: 6,
  },
  treeEmptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  platformHelpText: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  exportBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.glow,
  },
  exportBtnDisabled: {
    opacity: 0.5,
  },
  exportBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
});
