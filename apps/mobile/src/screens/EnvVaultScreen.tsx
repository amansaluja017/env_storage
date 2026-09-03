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
  Alert,
  Platform,
} from 'react-native';
import { COLORS } from '../theme';

interface EnvItem {
  id: string;
  key: string;
  value: string;
  environment: 'development' | 'staging' | 'production';
  isSecret: boolean;
  comment?: string;
  createdBy: string;
  updatedAt: string;
}

interface EnvVaultScreenProps {
  token: string;
  workspaceId: string;
  teamId: string;
  apiBaseUrl: string;
}

export function EnvVaultScreen({ token, workspaceId, teamId, apiBaseUrl }: EnvVaultScreenProps) {
  const [environment, setEnvironment] = useState<'development' | 'staging' | 'production'>('development');
  const [envsList, setEnvsList] = useState<EnvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  // Add / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [valueInput, setValueInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [isSecretInput, setIsSecretInput] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Bulk Raw .env Modal State
  const [rawModalVisible, setRawModalVisible] = useState(false);
  const [rawDotEnv, setRawDotEnv] = useState('');

  const fetchEnvs = async () => {
    if (!workspaceId || !teamId) return;
    setLoading(true);
    try {
      const url = `${apiBaseUrl}/trpc/env.list?input=${encodeURIComponent(
        JSON.stringify({ workspaceId, teamId, environment })
      )}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.result?.data) {
        setEnvsList(data.result.data);
      }
    } catch (e) {
      console.log('Error fetching envs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvs();
  }, [workspaceId, teamId, environment, token]);

  const handleSaveEnv = async () => {
    if (!keyInput.trim()) {
      Alert.alert('Error', 'Please provide a valid key name (e.g. DATABASE_URL)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/trpc/env.upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingId || undefined,
          workspaceId,
          teamId,
          environment,
          key: keyInput.toUpperCase().trim(),
          value: valueInput,
          isSecret: isSecretInput,
          comment: commentInput,
        }),
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message);
      }
      setModalVisible(false);
      resetForm();
      fetchEnvs();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Unable to save environment variable');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, keyName: string) => {
    Alert.alert(
      'Delete Environment Variable',
      `Are you sure you want to delete ${keyName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${apiBaseUrl}/trpc/env.delete`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ id }),
              });
              fetchEnvs();
            } catch (e) {
              console.log('Delete error:', e);
            }
          },
        },
      ]
    );
  };

  const handleImportBulk = async () => {
    if (!rawDotEnv.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/trpc/env.bulkImport`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId,
          teamId,
          environment,
          rawDotEnvContent: rawDotEnv,
        }),
      });
      const data = await res.json();
      if (data.result?.data) {
        Alert.alert('Success', `Imported ${data.result.data.importedCount} variables to SQLite!`);
        setRawModalVisible(false);
        setRawDotEnv('');
        fetchEnvs();
      }
    } catch (e: any) {
      Alert.alert('Import Failed', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const resetForm = () => {
    setEditingId(null);
    setKeyInput('');
    setValueInput('');
    setCommentInput('');
    setIsSecretInput(true);
  };

  const openEdit = (item: EnvItem) => {
    setEditingId(item.id);
    setKeyInput(item.key);
    setValueInput(item.value);
    setCommentInput(item.comment || '');
    setIsSecretInput(item.isSecret);
    setModalVisible(true);
  };

  const filteredEnvs = envsList.filter(e =>
    e.key.toLowerCase().includes(search.toLowerCase()) ||
    (e.comment && e.comment.toLowerCase().includes(search.toLowerCase()))
  );

  const formattedDotEnvExport = filteredEnvs
    .map(e => `${e.key}="${e.value}"`)
    .join('\n');

  return (
    <View style={styles.container}>
      {/* DB Engine Badge */}
      <View style={styles.engineBar}>
        <View style={styles.engineBadge}>
          <Text style={styles.engineBadgeText}>🗄️ SQLite Engine Active</Text>
        </View>
        <Text style={styles.engineMeta}>Encrypted Local Vault Storage</Text>
      </View>

      {/* Environment Selector Tabs */}
      <View style={styles.envTabsRow}>
        {(['development', 'staging', 'production'] as const).map(envName => {
          const isActive = environment === envName;
          return (
            <TouchableOpacity
              key={envName}
              style={[styles.envTab, isActive && styles.envTabActive]}
              onPress={() => setEnvironment(envName)}
            >
              <Text style={[styles.envTabText, isActive && styles.envTabTextActive]}>
                {envName.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Actions & Search */}
      <View style={styles.actionRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter variables..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            resetForm();
            setModalVisible(true);
          }}
        >
          <Text style={styles.addBtnText}>+ Add Key</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bulkBtn}
          onPress={() => setRawModalVisible(true)}
        >
          <Text style={styles.bulkBtnText}>📄 .env</Text>
        </TouchableOpacity>
      </View>

      {/* Env Items List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Reading SQLite Vault...</Text>
        </View>
      ) : filteredEnvs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>No Environment Variables</Text>
          <Text style={styles.emptyText}>
            No variables set for {environment.toUpperCase()} in this team.
          </Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={() => {
              resetForm();
              setModalVisible(true);
            }}
          >
            <Text style={styles.emptyAddBtnText}>Add First Variable</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {filteredEnvs.map(item => {
            const isRevealed = revealedIds[item.id];
            const displayValue = item.isSecret && !isRevealed ? '••••••••••••••••' : item.value;

            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.keyBadgeContainer}>
                    <Text style={styles.keyName}>{item.key}</Text>
                    {item.isSecret && (
                      <View style={styles.secretTag}>
                        <Text style={styles.secretTagText}>SECRET</Text>
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
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => openEdit(item)}
                    >
                      <Text style={styles.actionIconText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleDelete(item.id, item.key)}
                    >
                      <Text style={styles.actionIconText}>🗑️</Text>
                    </TouchableOpacity>
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
                  <Text style={styles.metaText}>SQLite Engine</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingId ? 'Edit Variable' : 'Add New Variable'}
            </Text>

            <Text style={styles.modalLabel}>Key Name</Text>
            <TextInput
              style={styles.modalInput}
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder="e.g. DATABASE_URL"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
            />

            <Text style={styles.modalLabel}>Secret Value</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMulti]}
              value={valueInput}
              onChangeText={setValueInput}
              placeholder="Enter variable value..."
              placeholderTextColor={COLORS.textMuted}
              multiline
            />

            <Text style={styles.modalLabel}>Comment / Description</Text>
            <TextInput
              style={styles.modalInput}
              value={commentInput}
              onChangeText={setCommentInput}
              placeholder="Usage notes..."
              placeholderTextColor={COLORS.textMuted}
            />

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setIsSecretInput(!isSecretInput)}
            >
              <View style={[styles.checkbox, isSecretInput && styles.checkboxChecked]}>
                {isSecretInput && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>Mask as Sensitive Secret</Text>
            </TouchableOpacity>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEnv}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>Save to SQLite</Text>
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
            <Text style={styles.modalTitle}>📄 Raw .env Bulk Parser</Text>
            <Text style={styles.modalSubtitle}>
              Paste raw .env content below to bulk import into SQLite.
            </Text>

            <TextInput
              style={[styles.modalInput, { height: 160 }]}
              value={rawDotEnv || formattedDotEnvExport}
              onChangeText={setRawDotEnv}
              placeholder={`KEY_1=value1\nKEY_2=value2`}
              placeholderTextColor={COLORS.textMuted}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRawModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleImportBulk}
                disabled={submitting}
              >
                <Text style={styles.saveBtnText}>Import into Vault</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 16,
  },
  engineBar: {
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
  engineBadge: {
    backgroundColor: COLORS.primaryGlow,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  engineBadgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  engineMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  envTabsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
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
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  envTabTextActive: {
    color: '#000000',
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
    paddingVertical: 8,
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
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  bulkBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  bulkBtnText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyAddBtn: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyAddBtnText: {
    color: '#000',
    fontWeight: '700',
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
    padding: 14,
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
    flex: 1,
  },
  keyName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 8,
  },
  secretTag: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  secretTagText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconBtn: {
    padding: 6,
    marginLeft: 4,
  },
  actionIconText: {
    fontSize: 16,
  },
  valueBox: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    marginBottom: 6,
  },
  valueText: {
    color: COLORS.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  commentText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  metaText: {
    color: COLORS.borderLight,
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSubtle,
    marginBottom: 4,
    marginTop: 10,
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
  },
  modalInputMulti: {
    height: 70,
    textAlignVertical: 'top',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
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
  saveBtnText: {
    color: '#000',
    fontWeight: '800',
  },
});
