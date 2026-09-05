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
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import {
  initMobileSqlite,
  getMobileEnvs,
  upsertMobileEnv,
  deleteMobileEnv,
  bulkImportMobileEnvs,
  getMobileFolders,
  createMobileFolder,
  deleteMobileFolder,
  EnvItem,
  FolderItem,
} from '../storage/mobileSqlite';
import { SqliteInspectorModal } from '../components/SqliteInspectorModal';

interface EnvVaultScreenProps {
  token: string;
  workspaceId: string;
  teamId: string;
  apiBaseUrl: string;
  user?: { id: string; email: string; name: string } | null;
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
  description: string;
}

interface RawDotEnvFormData {
  rawDotEnv: string;
  folderId: string;
}

export function EnvVaultScreen({ token, workspaceId, teamId, apiBaseUrl, user }: EnvVaultScreenProps) {
  const [environment, setEnvironment] = useState<'development' | 'staging' | 'production'>('development');
  const [envsList, setEnvsList] = useState<EnvItem[]>([]);
  const [foldersList, setFoldersList] = useState<FolderItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | 'all' | 'root'>('all');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

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

  // SQLite DB Inspector Modal State
  const [sqliteModalVisible, setSqliteModalVisible] = useState(false);

  useEffect(() => {
    initMobileSqlite();
  }, []);

  const fetchFolders = async () => {
    if (!workspaceId || !teamId) return;
    try {
      const fList = await getMobileFolders(workspaceId, teamId, environment);
      setFoldersList(fList);
    } catch (e) {
      console.log('Error reading Mobile SQLite folders:', e);
    }
  };

  const fetchEnvs = async () => {
    if (!workspaceId || !teamId) return;
    setLoading(true);
    try {
      // Direct query from Mobile SQLite database with folder filter
      const items = await getMobileEnvs(
        workspaceId,
        teamId,
        environment,
        undefined,
        activeFolderId
      );
      setEnvsList(items);
      await fetchFolders();
    } catch (e) {
      console.log('Error reading Mobile SQLite envs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvs();
  }, [workspaceId, teamId, environment, activeFolderId]);

  // Create Folder Handler
  const onCreateFolder = async (data: CreateFolderFormData) => {
    setCreatingFolder(true);
    const creatorName = user?.name || 'Mobile User';
    try {
      const newFolder = await createMobileFolder({
        workspaceId,
        teamId,
        environment,
        name: data.name,
        description: data.description,
        createdBy: creatorName,
      });

      setFolderModalVisible(false);
      resetFolderForm({ name: '', description: '' });
      setActiveFolderId(newFolder.id);
      fetchFolders();
      fetchEnvs();
    } catch (e: any) {
      Alert.alert('Folder Creation Failed', e.message || 'Unable to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  // Delete Folder Handler
  const handleDeleteFolder = (folder: FolderItem) => {
    Alert.alert(
      `Delete Folder "${folder.name}"`,
      'Do you want to delete this folder? Variables inside will be moved to Root (Unassigned).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMobileFolder(folder.id, false);
              if (activeFolderId === folder.id) {
                setActiveFolderId('all');
              }
              fetchFolders();
              fetchEnvs();
            } catch (e: any) {
              Alert.alert('Delete Failed', e.message);
            }
          },
        },
      ]
    );
  };

  // Save Variable Handler
  const onSaveEnv = async (data: EnvFormData) => {
    setSubmitting(true);
    const creatorName = user?.name || 'Mobile User';
    try {
      await upsertMobileEnv({
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
      });

      setModalVisible(false);
      resetEnvForm({
        key: '',
        value: '',
        comment: '',
        isSecret: true,
        folderId: activeFolderId !== 'all' && activeFolderId !== 'root' ? activeFolderId : '',
      });
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
              await deleteMobileEnv(id);
              fetchEnvs();
            } catch (e) {
              console.log('Delete error in Mobile SQLite:', e);
            }
          },
        },
      ]
    );
  };

  const onImportBulk = async (data: RawDotEnvFormData) => {
    if (!data.rawDotEnv.trim()) return;
    setSubmitting(true);
    try {
      const creatorName = user?.name || 'Mobile User';
      await bulkImportMobileEnvs(
        workspaceId,
        teamId,
        environment,
        data.rawDotEnv,
        creatorName,
        data.folderId || (activeFolderId !== 'all' && activeFolderId !== 'root' ? activeFolderId : null)
      );

      setRawModalVisible(false);
      resetRawForm({ rawDotEnv: '', folderId: '' });
      fetchEnvs();
    } catch (e: any) {
      Alert.alert('Import Failed', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openAdd = () => {
    setEditingId(null);
    const targetFolder = activeFolderId !== 'all' && activeFolderId !== 'root' ? activeFolderId : '';
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

  const filteredEnvs = envsList.filter(e =>
    e.key.toLowerCase().includes(search.toLowerCase()) ||
    (e.comment && e.comment.toLowerCase().includes(search.toLowerCase())) ||
    (e.folderName && e.folderName.toLowerCase().includes(search.toLowerCase()))
  );

  const formattedDotEnvExport = filteredEnvs
    .map(e => `${e.key}="${e.value}"`)
    .join('\n');

  const openRawModal = () => {
    const targetFolder = activeFolderId !== 'all' && activeFolderId !== 'root' ? activeFolderId : '';
    resetRawForm({
      rawDotEnv: formattedDotEnvExport,
      folderId: targetFolder,
    });
    setRawModalVisible(true);
  };

  const activeFolderObj = foldersList.find(f => f.id === activeFolderId);
  const totalEnvsCount = foldersList.reduce((sum, f) => sum + (f.envCount || 0), 0);

  return (
    <View style={styles.container}>
      {/* DB Engine Badge & Inspector Trigger */}
      <TouchableOpacity
        style={styles.engineBar}
        onPress={() => setSqliteModalVisible(true)}
        activeOpacity={0.7}
      >
        <View style={styles.engineBadge}>
          <Text style={styles.engineBadgeText}>🗄️ SQLite Engine Active</Text>
        </View>
        <Text style={styles.inspectLink}>Inspect SQLite DB Data →</Text>
      </TouchableOpacity>

      {/* Environment Selector Tabs */}
      <View style={styles.envTabsRow}>
        {(['development', 'staging', 'production'] as const).map(envName => {
          const isActive = environment === envName;
          return (
            <TouchableOpacity
              key={envName}
              style={[styles.envTab, isActive && styles.envTabActive]}
              onPress={() => {
                setEnvironment(envName);
                setActiveFolderId('all');
              }}
            >
              <Text style={[styles.envTabText, isActive && styles.envTabTextActive]}>
                {envName.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Folders Navigation Bar */}
      <View style={styles.folderSection}>
        <View style={styles.folderSectionHeader}>
          <View style={styles.folderHeaderLeft}>
            <Text style={styles.folderSectionTitle}>FOLDERS</Text>
            <View style={styles.folderCountBadge}>
              <Text style={styles.folderCountText}>{foldersList.length}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.newFolderBtn}
            onPress={() => {
              resetFolderForm({ name: '', description: '' });
              setFolderModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="folder-outline" size={13} color={COLORS.secondary} style={{ marginRight: 4 }} />
            <Text style={styles.newFolderBtnText}>+ New Folder</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderScroll}>
          {/* All Envs Chip */}
          <TouchableOpacity
            style={[styles.folderChip, activeFolderId === 'all' && styles.folderChipActive]}
            onPress={() => setActiveFolderId('all')}
          >
            <Text style={[styles.folderChipIcon, activeFolderId === 'all' && styles.folderChipTextActive]}>
              📁
            </Text>
            <Text style={[styles.folderChipText, activeFolderId === 'all' && styles.folderChipTextActive]}>
              All Envs
            </Text>
            <View style={[styles.folderBadge, activeFolderId === 'all' && styles.folderBadgeActive]}>
              <Text style={[styles.folderBadgeText, activeFolderId === 'all' && styles.folderBadgeTextActive]}>
                {envsList.length}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Root / Unassigned Chip */}
          <TouchableOpacity
            style={[styles.folderChip, activeFolderId === 'root' && styles.folderChipActive]}
            onPress={() => setActiveFolderId('root')}
          >
            <Text style={[styles.folderChipIcon, activeFolderId === 'root' && styles.folderChipTextActive]}>
              📄
            </Text>
            <Text style={[styles.folderChipText, activeFolderId === 'root' && styles.folderChipTextActive]}>
              Root / Unfiled
            </Text>
          </TouchableOpacity>

          {/* Dynamic User Created Folders */}
          {foldersList.map(folder => {
            const isActive = activeFolderId === folder.id;
            return (
              <TouchableOpacity
                key={folder.id}
                style={[styles.folderChip, isActive && styles.folderChipActive]}
                onPress={() => setActiveFolderId(folder.id)}
                onLongPress={() => handleDeleteFolder(folder)}
              >
                <Text style={[styles.folderChipIcon, isActive && styles.folderChipTextActive]}>
                  📂
                </Text>
                <Text style={[styles.folderChipText, isActive && styles.folderChipTextActive]}>
                  {folder.name}
                </Text>
                <View style={[styles.folderBadge, isActive && styles.folderBadgeActive]}>
                  <Text style={[styles.folderBadgeText, isActive && styles.folderBadgeTextActive]}>
                    {folder.envCount ?? 0}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Active Folder Breadcrumb / Description Bar */}
      {activeFolderObj && (
        <View style={styles.activeFolderBanner}>
          <View style={{ flex: 1 }}>
            <View style={styles.breadcrumbRow}>
              <Text style={styles.breadcrumbRoot}>Vault / </Text>
              <Text style={styles.breadcrumbCurrent}>📁 {activeFolderObj.name}</Text>
            </View>
            {activeFolderObj.description ? (
              <Text style={styles.folderDescText}>{activeFolderObj.description}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.folderDeleteBtn}
            onPress={() => handleDeleteFolder(activeFolderObj)}
            accessibilityLabel="Delete folder"
          >
            <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

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
          onPress={openAdd}
        >
          <Text style={styles.addBtnText}>+ Add Key</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bulkBtn}
          onPress={openRawModal}
        >
          <Text style={styles.bulkBtnText}>📄 .env</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dbInspectBtn}
          onPress={() => setSqliteModalVisible(true)}
        >
          <Text style={styles.dbInspectBtnText}>🗄️ DB</Text>
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
          <Text style={styles.emptyTitle}>
            {activeFolderObj ? `No Variables in "${activeFolderObj.name}"` : 'No Environment Variables'}
          </Text>
          <Text style={styles.emptyText}>
            {activeFolderObj
              ? `Create a key inside this folder by clicking "Add Key to Folder".`
              : `No variables set for ${environment.toUpperCase()} in this team.`}
          </Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={openAdd}
          >
            <Text style={styles.emptyAddBtnText}>
              {activeFolderObj ? `+ Add Key to ${activeFolderObj.name}` : 'Add First Variable'}
            </Text>
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
                    {item.folderName && (
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
                  <Text style={styles.metaText}>
                    {item.folderName ? `📁 ${item.folderName}` : 'Root Vault'}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Create Folder Modal */}
      <Modal visible={folderModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>📁 Create New Folder</Text>
              <TouchableOpacity onPress={() => setFolderModalVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Organize your environment variables hierarchically into folders.
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
                onPress={handleFolderSubmit(onCreateFolder)}
                disabled={creatingFolder}
              >
                {creatingFolder ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>Create Folder</Text>
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
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>📄 Raw .env Bulk Parser</Text>
              <TouchableOpacity onPress={() => setRawModalVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Paste raw .env content below to bulk import into SQLite.
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

      {/* In-App SQLite DB Inspector Modal */}
      <SqliteInspectorModal
        visible={sqliteModalVisible}
        onClose={() => setSqliteModalVisible(false)}
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
  inspectLink: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
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

  // Folder Navigation Section
  folderSection: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  folderSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  folderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  folderSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginRight: 6,
  },
  folderCountBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  folderCountText: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '800',
  },
  newFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.secondaryGlow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  newFolderBtnText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  folderScroll: {
    flexDirection: 'row',
  },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  folderChipActive: {
    backgroundColor: COLORS.secondaryGlow,
    borderColor: COLORS.secondary,
  },
  folderChipIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  folderChipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  folderChipTextActive: {
    color: COLORS.secondary,
  },
  folderBadge: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  folderBadgeActive: {
    backgroundColor: COLORS.secondary,
  },
  folderBadgeText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  folderBadgeTextActive: {
    color: '#000',
  },

  // Active Folder Banner
  activeFolderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbRoot: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  breadcrumbCurrent: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: '800',
  },
  folderDescText: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  folderDeleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
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
});
