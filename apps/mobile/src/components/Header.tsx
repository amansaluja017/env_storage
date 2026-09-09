import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  TextInput,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTourTarget } from 'guideway';
import { COLORS } from '../theme';
import { showCustomAlert } from './CustomAlert';
import { apiClient } from '../utils/apiClient';

interface HeaderProps {
  user: { id: string; name: string; email: string };
  workspaces: Array<{ id: string; name: string; slug: string; ownerId?: string }>;
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenCreateWorkspace: () => void;
  onWorkspaceUpdated?: (ws: { id: string; name: string; slug: string; ownerId?: string }) => void;
  onWorkspaceDeleted?: (workspaceId: string) => void;

  teams: Array<{ id: string; workspaceId?: string; name: string; description?: string; createdBy?: string }>;
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  onOpenCreateTeam: () => void;
  onTeamUpdated?: (team: { id: string; workspaceId: string; name: string; description?: string; createdBy?: string }) => void;
  onTeamDeleted?: (teamId: string) => void;

  activeTab: 'envs' | 'team';
  onSelectTab: (tab: 'envs' | 'team') => void;
  onSignOut: () => void;
  onOpenAccount?: () => void;

  token?: string;
  apiBaseUrl?: string;

  onRefresh?: () => void;
  isRefreshing?: boolean;
  onStartTour?: () => void;
}

export function Header({
  user,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenCreateWorkspace,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
  teams,
  activeTeamId,
  onSelectTeam,
  onOpenCreateTeam,
  onTeamUpdated,
  onTeamDeleted,
  activeTab,
  onSelectTab,
  onSignOut,
  onOpenAccount,
  token,
  apiBaseUrl = '',
  onRefresh,
  isRefreshing = false,
  onStartTour,
}: HeaderProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const isVeryCompact = width < 340;

  const brandTargetRef = useTourTarget('tour-brand');
  const contextTargetRef = useTourTarget('tour-workspaces-teams');
  const tabsTargetRef = useTourTarget('tour-tabs');
  const avatarTargetRef = useTourTarget('tour-user-avatar');
  const startTourBtnTargetRef = useTourTarget('tour-start-tour-btn');

  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);

  // Manage Workspace state
  const [manageWsModalVisible, setManageWsModalVisible] = useState(false);
  const [wsToManage, setWsToManage] = useState<{ id: string; name: string; slug: string; ownerId?: string } | null>(null);
  const [editWsName, setEditWsName] = useState('');
  const [editWsSlug, setEditWsSlug] = useState('');
  const [isSavingWs, setIsSavingWs] = useState(false);
  const [isDeletingWs, setIsDeletingWs] = useState(false);

  // Manage Team state
  const [manageTeamModalVisible, setManageTeamModalVisible] = useState(false);
  const [teamToManage, setTeamToManage] = useState<{ id: string; workspaceId?: string; name: string; description?: string; createdBy?: string } | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamDesc, setEditTeamDesc] = useState('');
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  const spinValue = useRef(new Animated.Value(0)).current;

  const currentWs = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
  const currentTeam = teams.find((t) => t.id === activeTeamId) || teams[0];

  const handleRefreshPress = () => {
    Animated.sequence([
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
      Animated.timing(spinValue, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start();

    if (onRefresh) {
      onRefresh();
    }
  };

  const handleProfilePress = () => {
    if (onOpenAccount) {
      onOpenAccount();
    } else {
      showCustomAlert({
        title: user.name || 'Account Profile',
        message: `Signed in as:\n${user.email}`,
        type: 'info',
        buttons: [{ text: 'Close', style: 'default' }],
      });
    }
  };

  const handleLogoutPress = () => {
    onSignOut();
  };

  const handleSaveWorkspace = async () => {
    if (!wsToManage) return;
    const name = editWsName.trim();
    if (!name || name.length < 2) {
      showCustomAlert({
        title: 'Invalid Name',
        message: 'Workspace name must be at least 2 characters long.',
        type: 'warning',
      });
      return;
    }

    setIsSavingWs(true);
    try {
      const res = await apiClient.post(`${apiBaseUrl}/trpc/workspace.rename`, {
        workspaceId: wsToManage.id,
        name,
        slug: editWsSlug.trim() || undefined,
      });

      if (res.data?.result?.data) {
        const updated = res.data.result.data;
        showCustomAlert({
          title: 'Workspace Renamed',
          message: `Workspace successfully renamed to "${updated.name}".`,
          type: 'success',
        });
        onWorkspaceUpdated?.(updated);
        setManageWsModalVisible(false);
      } else {
        throw new Error(res.data?.error?.message || 'Failed to rename workspace');
      }
    } catch (e: any) {
      showCustomAlert({
        title: 'Error',
        message: e.response?.data?.error?.message || e.message || 'Failed to rename workspace',
        type: 'danger',
      });
    } finally {
      setIsSavingWs(false);
    }
  };

  const handleDeleteWorkspace = () => {
    if (!wsToManage) return;
    if (workspaces.length <= 1) {
      showCustomAlert({
        title: 'Cannot Delete',
        message: 'You cannot delete your only workspace.',
        type: 'warning',
      });
      return;
    }

    showCustomAlert({
      title: 'Delete Workspace',
      message: `Are you sure you want to permanently delete workspace "${wsToManage.name}"?\n\nThis will permanently delete all associated teams, folders, and environment variables. This action cannot be undone.`,
      type: 'danger',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingWs(true);
            try {
              const res = await apiClient.post(`${apiBaseUrl}/trpc/workspace.delete`, {
                workspaceId: wsToManage.id,
              });

              if (res.data?.result?.data?.success) {
                showCustomAlert({
                  title: 'Workspace Deleted',
                  message: `Workspace "${wsToManage.name}" has been permanently deleted.`,
                  type: 'success',
                });
                onWorkspaceDeleted?.(wsToManage.id);
                setManageWsModalVisible(false);
              } else {
                throw new Error(res.data?.error?.message || 'Failed to delete workspace');
              }
            } catch (e: any) {
              showCustomAlert({
                title: 'Error',
                message: e.response?.data?.error?.message || e.message || 'Failed to delete workspace',
                type: 'danger',
              });
            } finally {
              setIsDeletingWs(false);
            }
          },
        },
      ],
    });
  };

  const handleSaveTeam = async () => {
    if (!teamToManage) return;
    const name = editTeamName.trim();
    if (!name || name.length < 2) {
      showCustomAlert({
        title: 'Invalid Name',
        message: 'Team name must be at least 2 characters long.',
        type: 'warning',
      });
      return;
    }

    setIsSavingTeam(true);
    try {
      const res = await apiClient.post(`${apiBaseUrl}/trpc/team.rename`, {
        teamId: teamToManage.id,
        name,
        description: editTeamDesc.trim() || undefined,
      });

      if (res.data?.result?.data) {
        const updated = res.data.result.data;
        showCustomAlert({
          title: 'Team Renamed',
          message: `Team successfully renamed to "${updated.name}".`,
          type: 'success',
        });
        onTeamUpdated?.(updated);
        setManageTeamModalVisible(false);
      } else {
        throw new Error(res.data?.error?.message || 'Failed to rename team');
      }
    } catch (e: any) {
      showCustomAlert({
        title: 'Error',
        message: e.response?.data?.error?.message || e.message || 'Failed to rename team',
        type: 'danger',
      });
    } finally {
      setIsSavingTeam(false);
    }
  };

  const handleDeleteTeam = () => {
    if (!teamToManage) return;
    if (teams.length <= 1) {
      showCustomAlert({
        title: 'Cannot Delete',
        message: 'You cannot delete the only team in this workspace.',
        type: 'warning',
      });
      return;
    }

    showCustomAlert({
      title: 'Delete Team',
      message: `Are you sure you want to permanently delete team "${teamToManage.name}"?\n\nThis will remove all associated folders, vault keys, and member enrollments. This action cannot be undone.`,
      type: 'danger',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Team',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingTeam(true);
            try {
              const res = await apiClient.post(`${apiBaseUrl}/trpc/team.delete`, {
                teamId: teamToManage.id,
              });

              if (res.data?.result?.data?.success) {
                showCustomAlert({
                  title: 'Team Deleted',
                  message: `Team "${teamToManage.name}" has been permanently deleted.`,
                  type: 'success',
                });
                onTeamDeleted?.(teamToManage.id);
                setManageTeamModalVisible(false);
              } else {
                throw new Error(res.data?.error?.message || 'Failed to delete team');
              }
            } catch (e: any) {
              showCustomAlert({
                title: 'Error',
                message: e.response?.data?.error?.message || e.message || 'Failed to delete team',
                type: 'danger',
              });
            } finally {
              setIsDeletingTeam(false);
            }
          },
        },
      ],
    });
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Row 1: Brand Wordmark, Live Status & Quick Actions */}
      <View style={styles.topRow}>
        <View ref={brandTargetRef} style={styles.brandRow}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.brandLogoImg}
            resizeMode="contain"
          />
          <Text style={[styles.brandText, isVeryCompact && { fontSize: 14 }]}>ENV VAULT</Text>
          {!isCompact && (
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusPillText}>VAULT</Text>
            </View>
          )}
        </View>

        <View style={styles.actionRow}>
          {/* Start Tour Action Button */}
          <TouchableOpacity
            ref={startTourBtnTargetRef}
            style={[styles.tourBtn, isCompact && { paddingHorizontal: 7 }]}
            onPress={onStartTour}
            activeOpacity={0.75}
            accessibilityLabel="Start tour"
          >
            <Ionicons name="compass" size={15} color={COLORS.primary} />
            {!isCompact && <Text style={styles.tourBtnText}>Tour</Text>}
          </TouchableOpacity>

          {/* User Profile Avatar */}
          <TouchableOpacity
            ref={avatarTargetRef}
            style={styles.avatarBtn}
            onPress={handleProfilePress}
            activeOpacity={0.75}
            accessibilityLabel="User profile"
          >
            <Text style={styles.avatarText}>
              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </Text>
          </TouchableOpacity>

          {/* Separate Logout Action Button */}
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogoutPress}
            activeOpacity={0.7}
            accessibilityLabel="Sign out"
          >
            <Ionicons name="log-out-outline" size={16} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Row 2: Dedicated Workspace & Team Hierarchy Selector Card */}
      <View ref={contextTargetRef} style={styles.contextContainer}>
        {/* Workspace Selector Half */}
        <TouchableOpacity
          style={styles.contextCard}
          onPress={() => setWorkspaceModalOpen(true)}
          activeOpacity={0.75}
        >
          <View style={styles.contextIconBoxWs}>
            <Ionicons name="business" size={13} color={COLORS.primary} />
          </View>
          <View style={styles.contextTextGroup}>
            <Text style={styles.contextCategoryLabel}>WORKSPACE</Text>
            <Text style={styles.contextItemName} numberOfLines={1}>
              {currentWs?.name || 'Select Workspace'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={12} color={COLORS.textMuted} style={styles.contextChevron} />
        </TouchableOpacity>

        {/* Directional Hierarchy Arrow */}
        <View style={styles.contextArrowSeparator}>
          <Ionicons name="chevron-forward" size={13} color={COLORS.borderLight} />
        </View>

        {/* Team Selector Half */}
        <TouchableOpacity
          style={styles.contextCard}
          onPress={() => {
            if (!workspaces || workspaces.length === 0 || !activeWorkspaceId) {
              showCustomAlert({
                title: 'Workspace Required',
                message: 'You need to create a workspace first before you can view or create teams.',
                type: 'warning',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Create Workspace',
                    style: 'default',
                    onPress: () => onOpenCreateWorkspace(),
                  },
                ],
              });
              return;
            }
            setTeamModalOpen(true);
          }}
          activeOpacity={0.75}
        >
          <View style={styles.contextIconBoxTeam}>
            <Ionicons name="people" size={13} color={COLORS.secondary} />
          </View>
          <View style={styles.contextTextGroup}>
            <Text style={styles.contextCategoryLabelTeam}>TEAM</Text>
            <Text style={styles.contextItemName} numberOfLines={1}>
              {currentTeam?.name || 'Select Team'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={12} color={COLORS.textMuted} style={styles.contextChevron} />
        </TouchableOpacity>
      </View>

      {/* Row 3: Sleek Segmented Tab Switcher */}
      <View ref={tabsTargetRef} style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'envs' && styles.segmentBtnActive]}
          onPress={() => onSelectTab('envs')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'envs' ? 'key' : 'key-outline'}
            size={13}
            color={activeTab === 'envs' ? COLORS.primary : COLORS.textMuted}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.segmentText, activeTab === 'envs' && styles.segmentTextActive]}>
            Vault Keys
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'team' && styles.segmentBtnActiveTeam]}
          onPress={() => onSelectTab('team')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'team' ? 'people' : 'people-outline'}
            size={13}
            color={activeTab === 'team' ? COLORS.secondary : COLORS.textMuted}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.segmentText, activeTab === 'team' && styles.segmentTextActiveTeam]}>
            Team Members
          </Text>
        </TouchableOpacity>
      </View>

      {/* Workspace Selection Sheet Modal */}
      <Modal
        visible={workspaceModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setWorkspaceModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setWorkspaceModalOpen(false)}
        >
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTitleGroup}>
                <View style={styles.sheetIconBoxWs}>
                  <Ionicons name="business" size={16} color={COLORS.primary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>Workspaces</Text>
                  <Text style={styles.sheetSubtitle}>
                    {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} available
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setWorkspaceModalOpen(false)}
              >
                <Ionicons name="close" size={18} color={COLORS.textSubtle} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <TouchableOpacity
                    key={ws.id}
                    style={[styles.sheetItem, isActive && styles.sheetItemActiveWs]}
                    onPress={() => {
                      onSelectWorkspace(ws.id);
                      setWorkspaceModalOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sheetItemLeft}>
                      <View style={[styles.sheetAvatarWs, isActive && styles.sheetAvatarActiveWs]}>
                        <Text style={[styles.sheetAvatarTextWs, isActive && styles.sheetAvatarTextActiveWs]}>
                          {ws.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.sheetItemText, isActive && styles.sheetItemTextActiveWs]} numberOfLines={1}>
                          {ws.name}
                        </Text>
                        {ws.slug ? (
                          <Text style={styles.sheetItemSlug} numberOfLines={1}>
                            @{ws.slug}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.sheetItemRightActions}>
                      {ws.ownerId === user.id && (
                        <TouchableOpacity
                          style={styles.sheetActionIconBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            setWorkspaceModalOpen(false);
                            setWsToManage(ws);
                            setEditWsName(ws.name);
                            setEditWsSlug(ws.slug || '');
                            setManageWsModalVisible(true);
                          }}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="settings-outline" size={15} color={COLORS.textMuted} />
                        </TouchableOpacity>
                      )}

                      {isActive ? (
                        <View style={styles.checkBadgeWs}>
                          <Ionicons name="checkmark" size={13} color="#000" />
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={15} color={COLORS.borderLight} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={styles.sheetCreateBtnWs}
                onPress={() => {
                  setWorkspaceModalOpen(false);
                  onOpenCreateWorkspace();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={styles.sheetCreateBtnTextWs}>Create New Workspace</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Team Selection Sheet Modal */}
      <Modal
        visible={teamModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTeamModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setTeamModalOpen(false)}
        >
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTitleGroup}>
                <View style={styles.sheetIconBoxTeam}>
                  <Ionicons name="people" size={16} color={COLORS.secondary} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>Teams</Text>
                  <Text style={styles.sheetSubtitle}>
                    {teams.length} team{teams.length !== 1 ? 's' : ''} in {currentWs?.name || 'workspace'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setTeamModalOpen(false)}
              >
                <Ionicons name="close" size={18} color={COLORS.textSubtle} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              {teams.length === 0 ? (
                <View style={styles.emptyTeamsCard}>
                  <Ionicons name="people-outline" size={32} color={COLORS.textMuted} />
                  <Text style={styles.emptyTeamsTitle}>No Teams in this Workspace</Text>
                  <Text style={styles.emptyTeamsSubtitle}>
                    Create a team to manage member permissions and environment vaults.
                  </Text>
                </View>
              ) : (
                teams.map((t) => {
                  const isActive = t.id === activeTeamId;
                  const isTeamCreator = t.createdBy === user.id || currentWs?.ownerId === user.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.sheetItem, isActive && styles.sheetItemActiveTeam]}
                      onPress={() => {
                        onSelectTeam(t.id);
                        setTeamModalOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.sheetItemLeft}>
                        <View style={[styles.sheetAvatarTeam, isActive && styles.sheetAvatarActiveTeam]}>
                          <Text style={[styles.sheetAvatarTextTeam, isActive && styles.sheetAvatarTextActiveTeam]}>
                            {t.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={[styles.sheetItemText, isActive && styles.sheetItemTextActiveTeam]} numberOfLines={1}>
                            {t.name}
                          </Text>
                          {t.description ? (
                            <Text style={styles.sheetItemSlug} numberOfLines={1}>
                              {t.description}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.sheetItemRightActions}>
                        {isTeamCreator && (
                          <TouchableOpacity
                            style={styles.sheetActionIconBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              setTeamModalOpen(false);
                              setTeamToManage(t);
                              setEditTeamName(t.name);
                              setEditTeamDesc(t.description || '');
                              setManageTeamModalVisible(true);
                            }}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="settings-outline" size={15} color={COLORS.textMuted} />
                          </TouchableOpacity>
                        )}

                        {isActive ? (
                          <View style={styles.checkBadgeTeam}>
                            <Ionicons name="checkmark" size={13} color="#000" />
                          </View>
                        ) : (
                          <Ionicons name="chevron-forward" size={15} color={COLORS.borderLight} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={styles.sheetCreateBtnTeam}
                onPress={() => {
                  setTeamModalOpen(false);
                  if (!workspaces || workspaces.length === 0 || !activeWorkspaceId) {
                    showCustomAlert({
                      title: 'Workspace Required',
                      message: 'Teams belong to a workspace. Please create a workspace first before creating a team.',
                      type: 'warning',
                      buttons: [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Create Workspace',
                          style: 'default',
                          onPress: () => onOpenCreateWorkspace(),
                        },
                      ],
                    });
                    return;
                  }
                  onOpenCreateTeam();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={18} color={COLORS.secondary} style={{ marginRight: 6 }} />
                <Text style={styles.sheetCreateBtnTextTeam}>Create New Team</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Manage Workspace Modal */}
      <Modal
        visible={manageWsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setManageWsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.manageModalOverlay}
          activeOpacity={1}
          onPress={() => setManageWsModalVisible(false)}
        >
          <View style={styles.manageModalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.manageModalHeader}>
              <View style={styles.manageModalHeaderLeft}>
                <View style={styles.manageModalIconBoxWs}>
                  <Ionicons name="business" size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.manageModalTitleRow}>
                    <Text style={styles.manageModalTitle} numberOfLines={1}>
                      Workspace Settings
                    </Text>
                    <View style={styles.creatorBadge}>
                      <Text style={styles.creatorBadgeText}>CREATOR</Text>
                    </View>
                  </View>
                  <Text style={styles.manageModalSubtitle} numberOfLines={1}>
                    {wsToManage?.name}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.manageModalCloseBtn}
                onPress={() => setManageWsModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={COLORS.textSubtle} />
              </TouchableOpacity>
            </View>

            <View style={styles.manageForm}>
              <Text style={styles.manageFieldLabel}>WORKSPACE NAME</Text>
              <TextInput
                style={styles.manageInput}
                value={editWsName}
                onChangeText={setEditWsName}
                placeholder="e.g. Acme Corp"
                placeholderTextColor={COLORS.textMuted}
              />

              <Text style={[styles.manageFieldLabel, { marginTop: 12 }]}>WORKSPACE SLUG</Text>
              <TextInput
                style={styles.manageInput}
                value={editWsSlug}
                onChangeText={setEditWsSlug}
                placeholder="e.g. acme-corp"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.manageSaveBtn, { backgroundColor: COLORS.primary }]}
                onPress={handleSaveWorkspace}
                disabled={isSavingWs || isDeletingWs}
                activeOpacity={0.8}
              >
                {isSavingWs ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.manageSaveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Danger Zone */}
            <View style={styles.dangerZone}>
              <Text style={styles.dangerZoneTitle}>DANGER ZONE</Text>
              <Text style={styles.dangerZoneSubtitle}>
                Permanently deletes this workspace and all associated teams, folders, and environment secrets.
              </Text>
              <TouchableOpacity
                style={styles.dangerDeleteBtn}
                onPress={handleDeleteWorkspace}
                disabled={isSavingWs || isDeletingWs}
                activeOpacity={0.8}
              >
                {isDeletingWs ? (
                  <ActivityIndicator color={COLORS.danger} size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={15} color={COLORS.danger} style={{ marginRight: 6 }} />
                    <Text style={styles.dangerDeleteBtnText}>Delete Workspace</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Manage Team Modal */}
      <Modal
        visible={manageTeamModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setManageTeamModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.manageModalOverlay}
          activeOpacity={1}
          onPress={() => setManageTeamModalVisible(false)}
        >
          <View style={styles.manageModalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.manageModalHeader}>
              <View style={styles.manageModalHeaderLeft}>
                <View style={styles.manageModalIconBoxTeam}>
                  <Ionicons name="people" size={18} color={COLORS.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.manageModalTitleRow}>
                    <Text style={styles.manageModalTitle} numberOfLines={1}>
                      Team Settings
                    </Text>
                    <View style={styles.creatorBadgeTeam}>
                      <Text style={styles.creatorBadgeTextTeam}>CREATOR</Text>
                    </View>
                  </View>
                  <Text style={styles.manageModalSubtitle} numberOfLines={1}>
                    {teamToManage?.name}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.manageModalCloseBtn}
                onPress={() => setManageTeamModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={COLORS.textSubtle} />
              </TouchableOpacity>
            </View>

            <View style={styles.manageForm}>
              <Text style={styles.manageFieldLabel}>TEAM NAME</Text>
              <TextInput
                style={styles.manageInput}
                value={editTeamName}
                onChangeText={setEditTeamName}
                placeholder="e.g. Backend Team"
                placeholderTextColor={COLORS.textMuted}
              />

              <Text style={[styles.manageFieldLabel, { marginTop: 12 }]}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[styles.manageInput, { height: 50 }]}
                value={editTeamDesc}
                onChangeText={setEditTeamDesc}
                placeholder="Brief description of this team"
                placeholderTextColor={COLORS.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[styles.manageSaveBtn, { backgroundColor: COLORS.secondary }]}
                onPress={handleSaveTeam}
                disabled={isSavingTeam || isDeletingTeam}
                activeOpacity={0.8}
              >
                {isSavingTeam ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <Text style={styles.manageSaveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Danger Zone */}
            <View style={styles.dangerZone}>
              <Text style={styles.dangerZoneTitle}>DANGER ZONE</Text>
              <Text style={styles.dangerZoneSubtitle}>
                Permanently deletes this team, removing all its members, folders, and vault secrets.
              </Text>
              <TouchableOpacity
                style={styles.dangerDeleteBtn}
                onPress={handleDeleteTeam}
                disabled={isSavingTeam || isDeletingTeam}
                activeOpacity={0.8}
              >
                {isDeletingTeam ? (
                  <ActivityIndicator color={COLORS.danger} size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={15} color={COLORS.danger} style={{ marginRight: 6 }} />
                    <Text style={styles.dangerDeleteBtnText}>Delete Team</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  brandLogoImg: {
    width: 24,
    height: 24,
    borderRadius: 6,
    marginRight: 8,
  },
  brandText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 4,
  },
  statusPillText: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // Action Buttons Group (Refresh + Avatar)
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tourBtn: {
    height: 34,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 229, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 153, 0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tourBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  logoutBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Context Switchers Group (Workspace / Team)
  contextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  contextCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  contextIconBoxWs: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  contextIconBoxTeam: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  contextTextGroup: {
    flex: 1,
    justifyContent: 'center',
  },
  contextCategoryLabel: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  contextCategoryLabelTeam: {
    color: COLORS.secondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  contextItemName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  contextChevron: {
    marginLeft: 4,
  },
  contextArrowSeparator: {
    paddingHorizontal: 4,
  },

  // Segmented Tab Switcher
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  segmentBtnActiveTeam: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  segmentText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  segmentTextActiveTeam: {
    color: COLORS.secondary,
    fontWeight: '800',
  },

  // Bottom Sheet Modal Styles
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetContainer: {
    backgroundColor: '#121316',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '80%',
    paddingBottom: 24,
    width: '100%',
    maxWidth: 580,
    alignSelf: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderLight,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetIconBoxWs: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sheetIconBoxTeam: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sheetTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: 340,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  sheetItemActiveWs: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: COLORS.primary,
  },
  sheetItemActiveTeam: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderColor: COLORS.secondary,
  },
  sheetItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sheetAvatarWs: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sheetAvatarActiveWs: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: COLORS.primary,
  },
  sheetAvatarTextWs: {
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 14,
  },
  sheetAvatarTextActiveWs: {
    color: COLORS.primary,
  },
  sheetAvatarTeam: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sheetAvatarActiveTeam: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    borderColor: COLORS.secondary,
  },
  sheetAvatarTextTeam: {
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 14,
  },
  sheetAvatarTextActiveTeam: {
    color: COLORS.secondary,
  },
  sheetItemText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetItemTextActiveWs: {
    color: COLORS.primary,
  },
  sheetItemTextActiveTeam: {
    color: COLORS.secondary,
  },
  sheetItemSlug: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  checkBadgeWs: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBadgeTeam: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sheetCreateBtnWs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  sheetCreateBtnTextWs: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetCreateBtnTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  sheetCreateBtnTextTeam: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyTeamsCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 8,
  },
  emptyTeamsTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
  emptyTeamsSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },

  // Sheet right action buttons
  sheetItemRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetActionIconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Manage Modals
  manageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  manageModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  manageModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  manageModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  manageModalIconBoxWs: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  manageModalIconBoxTeam: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  manageModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  manageModalTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },
  creatorBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  creatorBadgeText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  creatorBadgeTeam: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  creatorBadgeTextTeam: {
    color: COLORS.secondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  manageModalSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  manageModalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  manageForm: {
    marginBottom: 16,
  },
  manageFieldLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  manageInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 13,
  },
  manageSaveBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  manageSaveBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
  },
  dangerZone: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 14,
  },
  dangerZoneTitle: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  dangerZoneSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 12,
  },
  dangerDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 10,
    paddingVertical: 10,
  },
  dangerDeleteBtnText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '800',
  },
});
