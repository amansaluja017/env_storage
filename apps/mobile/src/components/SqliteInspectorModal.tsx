import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { COLORS } from '../theme';
import {
  getAllMobileEnvsRaw,
  getAllMobileFoldersRaw,
  executeMobileSqliteQuery,
  getMobileSqliteStats,
} from '../storage/mobileSqlite';

interface SqliteInspectorModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SqliteInspectorModal({ visible, onClose }: SqliteInspectorModalProps) {
  const [activeTab, setActiveTab] = useState<'table' | 'json' | 'query'>('table');
  const [activeTable, setActiveTable] = useState<'envs' | 'folders'>('envs');
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<{
    isNative: boolean;
    dbName: string;
    totalRows: number;
    totalFolders?: number;
    tables: string[];
  }>({
    isNative: false,
    dbName: 'mobile_env_vault.db',
    totalRows: 0,
    totalFolders: 0,
    tables: [],
  });
  const [loading, setLoading] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [customQuery, setCustomQuery] = useState('SELECT * FROM envs LIMIT 20;');
  const [queryError, setQueryError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setQueryError(null);
    try {
      const [statsData, rawRows] = await Promise.all([
        getMobileSqliteStats(),
        activeTable === 'envs' ? getAllMobileEnvsRaw() : getAllMobileFoldersRaw(),
      ]);
      setStats(statsData);
      setRows(rawRows);
    } catch (e: any) {
      setQueryError(e.message || 'Error loading SQLite data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, activeTable]);

  const handleRunQuery = async () => {
    if (!customQuery.trim()) return;
    setLoading(true);
    setQueryError(null);
    try {
      const result = await executeMobileSqliteQuery(customQuery.trim());
      setRows(result);
    } catch (e: any) {
      setQueryError(e.message || 'Query execution error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <View style={styles.badgeRow}>
                <Text style={styles.title}>🗄️ SQLite DB Inspector</Text>
                <View
                  style={[
                    styles.modeBadge,
                    stats.isNative ? styles.modeBadgeNative : styles.modeBadgeFallback,
                  ]}
                >
                  <Text style={styles.modeBadgeText}>
                    {stats.isNative ? '⚡ NATIVE SQLITE' : 'IN-MEMORY'}
                  </Text>
                </View>
              </View>
              <Text style={styles.subtitle}>
                DB: {stats.dbName} • Rows: {rows.length} • Tables: {stats.tables.join(', ') || 'envs'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Sub-nav Controls */}
          <View style={styles.controlsRow}>
            <View style={styles.tabGroup}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'table' && styles.tabBtnActive]}
                onPress={() => setActiveTab('table')}
              >
                <Text style={[styles.tabBtnText, activeTab === 'table' && styles.tabBtnTextActive]}>
                  📊 Table
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'json' && styles.tabBtnActive]}
                onPress={() => setActiveTab('json')}
              >
                <Text style={[styles.tabBtnText, activeTab === 'json' && styles.tabBtnTextActive]}>
                  {'{ }'} JSON
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'query' && styles.tabBtnActive]}
                onPress={() => setActiveTab('query')}
              >
                <Text style={[styles.tabBtnText, activeTab === 'query' && styles.tabBtnTextActive]}>
                  ⚡ Query
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toolActions}>
              <TouchableOpacity
                style={[styles.secretToggle, showSecrets && styles.secretToggleActive]}
                onPress={() => setShowSecrets(!showSecrets)}
              >
                <Text style={styles.secretToggleText}>
                  {showSecrets ? '👁️ Shown' : '🔒 Masked'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
                <Text style={styles.refreshBtnText}>🔄</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Query Bar (when on Query Tab) */}
          {activeTab === 'query' && (
            <View style={styles.queryBar}>
              <TextInput
                style={styles.queryInput}
                value={customQuery}
                onChangeText={setCustomQuery}
                placeholder="Enter SQL SELECT query..."
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.runBtn} onPress={handleRunQuery}>
                <Text style={styles.runBtnText}>Run</Text>
              </TouchableOpacity>
            </View>
          )}

          {queryError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠ {queryError}</Text>
            </View>
          )}

          {/* Table Switcher Bar (when on Table Tab) */}
          {activeTab === 'table' && (
            <View style={styles.tableSwitchRow}>
              <TouchableOpacity
                style={[styles.tableSwitchBtn, activeTable === 'envs' && styles.tableSwitchBtnActive]}
                onPress={() => setActiveTable('envs')}
              >
                <Text style={[styles.tableSwitchText, activeTable === 'envs' && styles.tableSwitchTextActive]}>
                  📄 envs ({stats.totalRows || 0})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tableSwitchBtn, activeTable === 'folders' && styles.tableSwitchBtnActive]}
                onPress={() => setActiveTable('folders')}
              >
                <Text style={[styles.tableSwitchText, activeTable === 'folders' && styles.tableSwitchTextActive]}>
                  📁 folders ({stats.totalFolders || 0})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Main Content Area */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Executing SQLite operation...</Text>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No rows returned in {activeTable}</Text>
            </View>
          ) : activeTab === 'json' ? (
            <ScrollView style={styles.scrollArea}>
              <Text style={styles.jsonText}>{JSON.stringify(rows, null, 2)}</Text>
            </ScrollView>
          ) : activeTable === 'folders' ? (
            <ScrollView horizontal style={styles.horizontalScroll}>
              <ScrollView style={styles.scrollArea}>
                <View style={styles.table}>
                  {/* Folders Table Header */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCell, { width: 140 }]}>NAME</Text>
                    <Text style={[styles.tableHeaderCell, { width: 180 }]}>DESCRIPTION</Text>
                    <Text style={[styles.tableHeaderCell, { width: 100 }]}>ENV</Text>
                    <Text style={[styles.tableHeaderCell, { width: 110 }]}>CREATED BY</Text>
                    <Text style={[styles.tableHeaderCell, { width: 120 }]}>WORKSPACE</Text>
                    <Text style={[styles.tableHeaderCell, { width: 110 }]}>TEAM</Text>
                    <Text style={[styles.tableHeaderCell, { width: 120 }]}>FOLDER ID</Text>
                  </View>

                  {/* Folders Table Rows */}
                  {rows.map((row, idx) => (
                    <View
                      key={row.id || idx}
                      style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                    >
                      <Text style={[styles.tableCell, styles.cellKey, { width: 140 }]} numberOfLines={1}>
                        📁 {row.name}
                      </Text>
                      <Text style={[styles.tableCell, styles.cellVal, { width: 180 }]} numberOfLines={1}>
                        {row.description || '-'}
                      </Text>
                      <View style={[{ width: 100 }, styles.cellEnvBadge]}>
                        <Text style={[styles.cellEnvText, { color: COLORS.secondary }]}>
                          {row.environment}
                        </Text>
                      </View>
                      <Text style={[styles.tableCell, styles.cellDim, { width: 110 }]} numberOfLines={1}>
                        {row.createdBy || row.created_by}
                      </Text>
                      <Text style={[styles.tableCell, styles.cellDim, { width: 120 }]} numberOfLines={1}>
                        {row.workspace_id || row.workspaceId}
                      </Text>
                      <Text style={[styles.tableCell, styles.cellDim, { width: 110 }]} numberOfLines={1}>
                        {row.team_id || row.teamId}
                      </Text>
                      <Text style={[styles.tableCell, styles.cellComment, { width: 120 }]} numberOfLines={1}>
                        {row.id}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </ScrollView>
          ) : (
            <ScrollView horizontal style={styles.horizontalScroll}>
              <ScrollView style={styles.scrollArea}>
                <View style={styles.table}>
                  {/* Envs Table Header */}
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableHeaderCell, { width: 140 }]}>KEY</Text>
                    <Text style={[styles.tableHeaderCell, { width: 180 }]}>VALUE</Text>
                    <Text style={[styles.tableHeaderCell, { width: 100 }]}>FOLDER</Text>
                    <Text style={[styles.tableHeaderCell, { width: 90 }]}>ENV</Text>
                    <Text style={[styles.tableHeaderCell, { width: 60 }]}>SECRET</Text>
                    <Text style={[styles.tableHeaderCell, { width: 110 }]}>BY</Text>
                    <Text style={[styles.tableHeaderCell, { width: 160 }]}>COMMENT</Text>
                  </View>

                  {/* Envs Table Rows */}
                  {rows.map((row, idx) => {
                    const isSecret = Boolean(row.is_secret ?? row.isSecret);
                    const val =
                      isSecret && !showSecrets
                        ? '••••••••••••'
                        : String(row.value ?? '');

                    const envColor =
                      row.environment === 'production'
                        ? COLORS.danger
                        : row.environment === 'staging'
                        ? COLORS.warning
                        : COLORS.primary;

                    return (
                      <View
                        key={row.id || idx}
                        style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                      >
                        <Text style={[styles.tableCell, styles.cellKey, { width: 140 }]} numberOfLines={1}>
                          {row.key}
                        </Text>
                        <Text
                          style={[
                            styles.tableCell,
                            styles.cellVal,
                            isSecret && !showSecrets && styles.cellMasked,
                            { width: 180 },
                          ]}
                          numberOfLines={1}
                        >
                          {val}
                        </Text>
                        <Text style={[styles.tableCell, { width: 100, color: COLORS.secondary }]} numberOfLines={1}>
                          {row.folder_id || row.folderId ? `📁 ${row.folder_id || row.folderId}` : 'Root'}
                        </Text>
                        <View style={[{ width: 90 }, styles.cellEnvBadge]}>
                          <Text style={[styles.cellEnvText, { color: envColor }]}>
                            {row.environment}
                          </Text>
                        </View>
                        <Text style={[styles.tableCell, { width: 60, color: isSecret ? COLORS.warning : COLORS.textMuted }]}>
                          {isSecret ? 'Yes' : 'No'}
                        </Text>
                        <Text style={[styles.tableCell, styles.cellDim, { width: 110 }]} numberOfLines={1}>
                          {row.created_by || row.createdBy}
                        </Text>
                        <Text style={[styles.tableCell, styles.cellComment, { width: 160 }]} numberOfLines={1}>
                          {row.comment || '-'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </ScrollView>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerTip}>
              Tip: In terminal run <Text style={styles.cliCode}>npm run db:view</Text> to inspect via CLI
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: '92%',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modeBadgeNative: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  modeBadgeFallback: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  tabGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.card,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabBtnTextActive: {
    color: '#000000',
  },
  toolActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secretToggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secretToggleActive: {
    borderColor: COLORS.warning,
  },
  secretToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSubtle,
  },
  refreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.card,
  },
  refreshBtnText: {
    fontSize: 13,
  },
  queryBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  queryInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: COLORS.text,
    fontFamily: 'monospace',
    fontSize: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  runBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  runBtnText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 12,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.danger,
    marginBottom: 8,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  scrollArea: {
    flex: 1,
  },
  horizontalScroll: {
    flex: 1,
  },
  jsonText: {
    fontFamily: 'monospace',
    color: COLORS.primary,
    fontSize: 11,
    padding: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  tableCell: {
    fontSize: 11,
    color: COLORS.text,
    paddingHorizontal: 4,
  },
  cellKey: {
    fontWeight: '600',
    color: '#a78bfa', // Light violet
  },
  cellVal: {
    fontFamily: 'monospace',
  },
  cellMasked: {
    color: COLORS.textMuted,
    letterSpacing: 2,
  },
  cellEnvBadge: {
    paddingHorizontal: 4,
  },
  cellEnvText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cellDim: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  cellComment: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
    fontSize: 10,
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'center',
  },
  footerTip: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  cliCode: {
    color: COLORS.primary,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  tableSwitchRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 8,
  },
  tableSwitchBtn: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tableSwitchBtnActive: {
    backgroundColor: COLORS.secondaryGlow,
    borderColor: COLORS.secondary,
  },
  tableSwitchText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tableSwitchTextActive: {
    color: COLORS.secondary,
    fontWeight: '700',
  },
});
