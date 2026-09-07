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
  Animated,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { useTourTarget } from 'guideway';
import { COLORS } from '../theme';
import { apiClient } from '../utils/apiClient';
import { showCustomAlert } from '../components/CustomAlert';
import * as Clipboard from 'expo-clipboard';
import { MembersListSkeleton } from '../components/Skeleton';

interface TeamMember {
  id: string;
  userId: string;
  role: 'admin' | 'member';
  userName?: string;
  userEmail?: string;
  userRole?: 'admin' | 'member';
  isWorkspaceOwner?: boolean;
  joinedAt?: string;
}

function formatJoinedDate(dateStr?: string | Date): string {
  if (!dateStr) return 'Joined recently';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Joined recently';
    return `Joined ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch {
    return 'Joined recently';
  }
}

function formatInviteDate(dateStr?: string | Date): string {
  if (!dateStr) return 'Invited recently';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Invited recently';
    return `Invited ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch {
    return 'Invited recently';
  }
}

interface TeamInvite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  inviteCode: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt?: string | Date;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  slug?: string;
  ownerId?: string;
}

export interface TeamItem {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string;
  createdBy?: string;
}

interface TeamScreenProps {
  token: string;
  workspaceId: string;
  teamId: string;
  team?: TeamItem;
  workspaces?: WorkspaceItem[];
  allTeams?: TeamItem[];
  apiBaseUrl: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role?: 'admin' | 'member';
  } | null;
  refreshTrigger?: number;
  onTeamUpdated?: (team: { id: string; name: string; description?: string }) => void;
  onTeamDeleted?: (teamId: string) => void;
}

interface InviteFormData {
  email: string;
  role: 'admin' | 'member';
}

export function TeamScreen({
  token,
  workspaceId,
  teamId,
  team,
  workspaces = [],
  allTeams = [],
  apiBaseUrl,
  user,
  refreshTrigger,
  onTeamUpdated,
  onTeamDeleted,
}: TeamScreenProps) {
  const inviteBtnTargetRef = useTourTarget('tour-invite-btn');
  const manageTeamBtnTargetRef = useTourTarget('tour-manage-team-btn');
  const membersHeaderTargetRef = useTourTarget('tour-members-header');

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(false);

  // Manage Team Modal State
  const [manageTeamModalVisible, setManageTeamModalVisible] = useState(false);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamDesc, setEditTeamDesc] = useState('');
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  // Section Refresh Animation & Handler
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
      await fetchTeamData();
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Role Management State
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [selectedMemberForRole, setSelectedMemberForRole] = useState<TeamMember | null>(null);
  const [targetRole, setTargetRole] = useState<'admin' | 'member'>('member');
  const [updatingRole, setUpdatingRole] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

  // Invite Modal Form State (react-hook-form)
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [selectedInviteWsId, setSelectedInviteWsId] = useState<string>(workspaceId);
  const [selectedInviteTeamId, setSelectedInviteTeamId] = useState<string>(teamId);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);

  useEffect(() => {
    if (workspaceId) setSelectedInviteWsId(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (teamId) setSelectedInviteTeamId(teamId);
  }, [teamId]);

  const availableWorkspaces = workspaces && workspaces.length > 0
    ? workspaces
    : (workspaceId ? [{ id: workspaceId, name: 'Current Workspace' }] : []);

  const teamsForSelectedWs = (allTeams || []).filter(t => t.workspaceId === selectedInviteWsId);

  const openInviteModal = () => {
    setSelectedInviteWsId(workspaceId);
    setSelectedInviteTeamId(teamId);
    setWsDropdownOpen(false);
    setTeamDropdownOpen(false);
    setInviteModalVisible(true);
  };

  const handleSelectInviteWorkspace = (wsId: string) => {
    setSelectedInviteWsId(wsId);
    setWsDropdownOpen(false);
    const wsTeams = (allTeams || []).filter(t => t.workspaceId === wsId);
    if (wsTeams.length > 0) {
      if (!wsTeams.some(t => t.id === selectedInviteTeamId)) {
        setSelectedInviteTeamId(wsTeams[0].id);
      }
    } else {
      setSelectedInviteTeamId('');
    }
  };

  const {
    control: inviteControl,
    handleSubmit: handleInviteSubmit,
    reset: resetInviteForm,
    formState: { errors: inviteErrors },
  } = useForm<InviteFormData>({
    defaultValues: {
      email: '',
      role: 'member',
    },
  });

  // Authorization check for current logged-in user
  const currentMember = members.find(m => m.userId === user?.id);
  const isCurrentAdmin =
    user?.role === 'admin' ||
    currentMember?.role === 'admin' ||
    Boolean(currentMember?.isWorkspaceOwner);

  const fetchTeamData = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      // Fetch members and invites via Axios apiClient
      const [mRes, iRes] = await Promise.all([
        apiClient.get(`${apiBaseUrl}/trpc/team.getMembers`, {
          params: { input: JSON.stringify({ teamId }) },
        }),
        apiClient.get(`${apiBaseUrl}/trpc/team.getInvites`, {
          params: { input: JSON.stringify({ teamId }) },
        }),
      ]);

      if (mRes.data?.result?.data) setMembers(mRes.data.result.data);
      if (iRes.data?.result?.data) setInvites(iRes.data.result.data);
    } catch (e) {
      console.log('Error fetching team:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [teamId, token]);

  // Re-fetch team data when navbar refresh button is pressed
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchTeamData();
    }
  }, [refreshTrigger]);

  const handleCopyInviteLink = async (inviteCode: string) => {
    try {
      const inviteUrl = `${apiBaseUrl}/auth/accept-invite?token=${inviteCode}`;
      await Clipboard.setStringAsync(inviteUrl);
      showCustomAlert({
        title: 'Link Copied! 📋',
        message: 'The invitation link has been copied to your clipboard. You can share it directly with your teammate.',
        type: 'success',
      });
    } catch {
      showCustomAlert({
        title: 'Copy Error',
        message: 'Failed to copy invite link to clipboard.',
        type: 'danger',
      });
    }
  };

  const onSendInvite = async (formData: InviteFormData) => {
    if (!selectedInviteWsId) {
      showCustomAlert({
        title: 'Workspace Required',
        message: 'Please select a workspace for the invitation.',
        type: 'danger',
      });
      return;
    }
    if (!selectedInviteTeamId) {
      showCustomAlert({
        title: 'Team Required',
        message: 'Please select a team for the invitation. If the selected workspace has no teams, please create one first.',
        type: 'danger',
      });
      return;
    }

    setInviting(true);
    try {
      const res = await apiClient.post(`${apiBaseUrl}/trpc/team.inviteMember`, {
        teamId: selectedInviteTeamId,
        workspaceId: selectedInviteWsId,
        email: formData.email.trim(),
        role: formData.role,
      });

      if (res.data?.result?.data) {
        showCustomAlert({
          title: 'Invitation Sent!',
          message: `An invitation email has been sent to ${formData.email.trim()}. The link will expire in 1 hour.`,
          type: 'success',
        });
        setInviteModalVisible(false);
        resetInviteForm();
        if (selectedInviteTeamId === teamId) {
          fetchTeamData();
        }
      } else {
        throw new Error(res.data?.error?.message || 'Failed to send invite');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error?.message || e.message || 'Failed to send invite';
      showCustomAlert({
        title: 'Invite Failed',
        message: msg,
        type: 'danger',
      });
    } finally {
      setInviting(false);
    }
  };

  const openRoleModal = (member: TeamMember) => {
    if (member.isWorkspaceOwner) return;
    setSelectedMemberForRole(member);
    const memberRole = member.role === 'admin' ? 'admin' : 'member';
    setTargetRole(memberRole);
    setRoleModalVisible(true);
  };

  const handleUpdateRole = async () => {
    if (!selectedMemberForRole) return;
    setUpdatingRole(true);
    try {
      const res = await apiClient.post(`${apiBaseUrl}/trpc/team.updateMemberRole`, {
        teamId,
        memberId: selectedMemberForRole.id,
        role: targetRole,
      });

      if (res.data?.result?.data) {
        showCustomAlert({
          title: 'Role Updated',
          message: `Role successfully changed to ${targetRole.toUpperCase()}.`,
          type: 'success',
        });
        setRoleModalVisible(false);
        setSelectedMemberForRole(null);
        fetchTeamData();
      } else {
        throw new Error(res.data?.error?.message || 'Failed to update role');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error?.message || e.message || 'Failed to update role';
      showCustomAlert({
        title: 'Update Failed',
        message: msg,
        type: 'danger',
      });
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleRemoveMember = (member: TeamMember) => {
    const memberName = member.userName || member.userEmail || 'this member';
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from this team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeletingMemberId(member.id);
            try {
              const res = await apiClient.post(`${apiBaseUrl}/trpc/team.removeMember`, {
                teamId,
                memberId: member.id,
              });

              if (res.data?.result?.data) {
                showCustomAlert({
                  title: 'Member Removed',
                  message: `${memberName} was removed from the team.`,
                  type: 'success',
                });
                fetchTeamData();
              } else {
                throw new Error(res.data?.error?.message || 'Failed to remove member');
              }
            } catch (e: any) {
              const msg = e.response?.data?.error?.message || e.message || 'Failed to remove member';
              showCustomAlert({
                title: 'Remove Failed',
                message: msg,
                type: 'danger',
              });
            } finally {
              setDeletingMemberId(null);
            }
          },
        },
      ]
    );
  };

  const openManageTeamModal = () => {
    setEditTeamName(team?.name || '');
    setEditTeamDesc(team?.description || '');
    setManageTeamModalVisible(true);
  };

  const handleSaveTeam = async () => {
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
        teamId,
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
    showCustomAlert({
      title: 'Delete Team',
      message: `Are you sure you want to permanently delete team "${team?.name || 'this team'}"?\n\nThis will remove all associated folders, vault keys, and member enrollments. This action cannot be undone.`,
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
                teamId,
              });

              if (res.data?.result?.data?.success) {
                showCustomAlert({
                  title: 'Team Deleted',
                  message: `Team "${team?.name || 'this team'}" has been permanently deleted.`,
                  type: 'success',
                });
                onTeamDeleted?.(teamId);
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

  return (
    <View style={styles.container}>
      {/* Top Banner Actions */}
      <View style={styles.actionBanner}>
        <TouchableOpacity
          ref={inviteBtnTargetRef}
          style={styles.inviteBtn}
          onPress={openInviteModal}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add" size={15} color="#000" style={{ marginRight: 6 }} />
          <Text style={styles.inviteBtnText}>Invite Team Member</Text>
        </TouchableOpacity>

        {isCurrentAdmin && (
          <TouchableOpacity
            ref={manageTeamBtnTargetRef}
            style={styles.manageTeamBtn}
            onPress={openManageTeamModal}
            activeOpacity={0.8}
          >
            <Ionicons name="settings-outline" size={15} color={COLORS.secondary} style={{ marginRight: 6 }} />
            <Text style={styles.manageTeamBtnText}>Settings</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.scroll}>
          <MembersListSkeleton count={4} />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Members List Header with In-Section Refresh */}
          <View ref={membersHeaderTargetRef} style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>ACTIVE TEAM MEMBERS ({members.length})</Text>
            <TouchableOpacity
              style={styles.refreshSectionBtn}
              onPress={handleManualRefresh}
              activeOpacity={0.7}
              accessibilityLabel="Refresh team members"
            >
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Ionicons
                  name="refresh-outline"
                  size={13}
                  color={isRefreshing ? COLORS.primary : COLORS.textMuted}
                />
              </Animated.View>
              <Text style={styles.refreshSectionBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>
          {members.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No Members Found</Text>
              <Text style={styles.noInvitesText}>Invite colleagues to collaborate on this vault.</Text>
            </View>
          ) : (
            members.map(m => {
              const isCurrentUser = m.userId === user?.id;
              const isOwner = Boolean(m.isWorkspaceOwner);
              // Role: workspace owners and team admins show as ADMIN, others as MEMBER
              const effectiveRole: 'admin' | 'member' = isOwner || m.role === 'admin' ? 'admin' : 'member';
              const canManage = isCurrentAdmin && !isOwner && !isCurrentUser;

              return (
                <View key={m.id} style={styles.memberCardWrapper}>
                  <View style={styles.memberCard}>
                    <View
                      style={[
                        styles.avatar,
                        effectiveRole === 'admin'
                          ? styles.avatarAdmin
                          : styles.avatarMember,
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          effectiveRole === 'admin'
                            ? styles.avatarTextAdmin
                            : styles.avatarTextMember,
                        ]}
                      >
                        {(m.userName || 'M').charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {m.userName || 'Team Member'}
                        </Text>
                        {isOwner && (
                          <View style={styles.ownerBadge}>
                            <Ionicons name="shield-checkmark" size={10} color={COLORS.primary} style={{ marginRight: 3 }} />
                            <Text style={styles.ownerBadgeText}>OWNER</Text>
                          </View>
                        )}
                        {isCurrentUser && (
                          <View style={styles.youBadge}>
                            <Text style={styles.youBadgeText}>YOU</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.memberEmail} numberOfLines={1}>
                        {m.userEmail || m.userId}
                      </Text>
                      <View style={styles.joinedDateRow}>
                        <Ionicons
                          name="calendar-outline"
                          size={11}
                          color={COLORS.textMuted}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.joinedDateText}>{formatJoinedDate(m.joinedAt)}</Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.roleTag,
                        effectiveRole === 'admin'
                          ? styles.roleAdmin
                          : styles.roleMember,
                      ]}
                    >
                      <View
                        style={[
                          styles.roleDot,
                          effectiveRole === 'admin'
                            ? styles.roleDotAdmin
                            : styles.roleDotMember,
                        ]}
                      />
                      <Text
                        style={[
                          styles.roleTagText,
                          effectiveRole === 'admin'
                            ? styles.roleTagTextAdmin
                            : styles.roleTagTextMember,
                        ]}
                      >
                        {effectiveRole.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {canManage && (
                    <View style={styles.memberActionsRow}>
                      <TouchableOpacity
                        style={styles.actionBtnRole}
                        onPress={() => openRoleModal(m)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="swap-horizontal"
                          size={13}
                          color={COLORS.secondary}
                          style={{ marginRight: 5 }}
                        />
                        <Text style={styles.actionBtnRoleText}>Change Role</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnDelete}
                        onPress={() => handleRemoveMember(m)}
                        disabled={deletingMemberId === m.id}
                        activeOpacity={0.7}
                      >
                        {deletingMemberId === m.id ? (
                          <ActivityIndicator size="small" color={COLORS.error} />
                        ) : (
                          <>
                            <Ionicons
                              name="trash-outline"
                              size={13}
                              color={COLORS.error}
                              style={{ marginRight: 5 }}
                            />
                            <Text style={styles.actionBtnDeleteText}>Remove</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* Redesigned Pending Invites Section */}
          <View style={styles.invitesSectionHeaderRow}>
            <View style={styles.invitesSectionTitleGroup}>
              <View style={styles.invitesSectionIconBox}>
                <Ionicons name="mail-outline" size={13} color={COLORS.warning} />
              </View>
              <Text style={styles.invitesSectionHeader}>PENDING INVITATIONS</Text>
              <View style={styles.invitesCountBadge}>
                <Text style={styles.invitesCountText}>
                  {invites.filter(i => i.status === 'pending').length}
                </Text>
              </View>
            </View>

            {isCurrentAdmin && (
              <TouchableOpacity
                style={styles.invitesQuickAddBtn}
                onPress={openInviteModal}
                activeOpacity={0.7}
                accessibilityLabel="Invite member"
              >
                <Ionicons name="person-add-outline" size={12} color={COLORS.secondary} style={{ marginRight: 4 }} />
                <Text style={styles.invitesQuickAddBtnText}>+ Invite</Text>
              </TouchableOpacity>
            )}
          </View>

          {invites.filter(i => i.status === 'pending').length === 0 ? (
            <View style={styles.emptyInvitesCard}>
              <View style={styles.emptyInvitesIconCircle}>
                <Ionicons name="mail-open-outline" size={22} color={COLORS.textMuted} />
              </View>
              <Text style={styles.emptyInvitesTitle}>No Pending Invitations</Text>
              <Text style={styles.emptyInvitesDesc}>
                All invited teammates have joined or no invitations are currently pending.
              </Text>
            </View>
          ) : (
            invites
              .filter(i => i.status === 'pending')
              .map(inv => {
                const initial = (inv.email || 'U').charAt(0).toUpperCase();
                const isAdmin = inv.role === 'admin';
                return (
                  <View key={inv.id} style={styles.redesignedInviteCard}>
                    <View style={styles.inviteCardTopRow}>
                      {/* Avatar with soft amber glowing theme */}
                      <View style={styles.inviteAvatarBox}>
                        <Text style={styles.inviteAvatarText}>{initial}</Text>
                      </View>

                      {/* Info: Email, Role & Date (NO code shown!) */}
                      <View style={styles.inviteInfoBox}>
                        <Text style={styles.inviteEmailText} numberOfLines={1}>
                          {inv.email}
                        </Text>
                        <View style={styles.inviteMetaRow}>
                          <View
                            style={[
                              styles.inviteRolePill,
                              isAdmin ? styles.inviteRolePillAdmin : styles.inviteRolePillMember,
                            ]}
                          >
                            <View
                              style={[
                                styles.inviteRoleDot,
                                isAdmin ? styles.inviteRoleDotAdmin : styles.inviteRoleDotMember,
                              ]}
                            />
                            <Text
                              style={[
                                styles.inviteRoleText,
                                isAdmin ? styles.inviteRoleTextAdmin : styles.inviteRoleTextMember,
                              ]}
                            >
                              {isAdmin ? 'ADMIN' : 'MEMBER'}
                            </Text>
                          </View>
                          <Text style={styles.inviteMetaBullet}>•</Text>
                          <View style={styles.inviteDateBox}>
                            <Ionicons
                              name="time-outline"
                              size={11}
                              color={COLORS.textMuted}
                              style={{ marginRight: 3 }}
                            />
                            <Text style={styles.inviteDateText}>
                              {formatInviteDate(inv.createdAt)}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Status Tag */}
                      <View style={styles.inviteStatusPill}>
                        <View style={styles.inviteStatusDot} />
                        <Text style={styles.inviteStatusLabel}>PENDING</Text>
                      </View>
                    </View>

                    {/* Action Bar: Copy Invite Link */}
                    {isCurrentAdmin && (
                      <View style={styles.inviteActionBar}>
                        <TouchableOpacity
                          style={styles.copyLinkBtn}
                          onPress={() => handleCopyInviteLink(inv.inviteCode)}
                          activeOpacity={0.7}
                          accessibilityLabel="Copy invitation link"
                        >
                          <Ionicons
                            name="link-outline"
                            size={13}
                            color={COLORS.primary}
                            style={{ marginRight: 5 }}
                          />
                          <Text style={styles.copyLinkBtnText}>Copy Invite Link</Text>
                        </TouchableOpacity>

                        <Text style={styles.inviteLinkHintText}>
                          Link ready to share with {inv.email.split('@')[0]}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
          )}
        </ScrollView>
      )}

      {/* Invite Modal */}
      <Modal visible={inviteModalVisible} animationType="slide" transparent onRequestClose={() => setInviteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIconBoxInvite}>
                  <Ionicons name="person-add" size={18} color={COLORS.secondary} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Invite Member</Text>
                  <Text style={styles.modalSubtitle}>Select workspace & team to send invite</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  setInviteModalVisible(false);
                  resetInviteForm();
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={COLORS.textSubtle} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              {/* Workspace Selection */}
              <Text style={styles.label}>1. Select Workspace</Text>
              <TouchableOpacity
                style={[styles.selectorBtn, wsDropdownOpen && styles.selectorBtnOpen]}
                onPress={() => {
                  setWsDropdownOpen(prev => !prev);
                  setTeamDropdownOpen(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.selectorBtnLeft}>
                  <Ionicons name="briefcase-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.selectorBtnText} numberOfLines={1}>
                    {availableWorkspaces.find(w => w.id === selectedInviteWsId)?.name || 'Choose Workspace'}
                  </Text>
                </View>
                <Ionicons name={wsDropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSubtle} />
              </TouchableOpacity>

              {wsDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  {availableWorkspaces.map(ws => {
                    const isSelected = ws.id === selectedInviteWsId;
                    return (
                      <TouchableOpacity
                        key={ws.id}
                        style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                        onPress={() => handleSelectInviteWorkspace(ws.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.dropdownItemLeft}>
                          <Ionicons
                            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                            size={15}
                            color={isSelected ? COLORS.primary : COLORS.textMuted}
                          />
                          <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                            {ws.name}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Team Selection */}
              <Text style={styles.label}>2. Select Team</Text>
              {teamsForSelectedWs.length === 0 ? (
                <View style={styles.emptyNoticeBox}>
                  <Ionicons name="alert-circle-outline" size={16} color="#f59e0b" />
                  <Text style={styles.emptyNoticeText}>No teams found in this workspace.</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.selectorBtn, teamDropdownOpen && styles.selectorBtnOpen]}
                    onPress={() => {
                      setTeamDropdownOpen(prev => !prev);
                      setWsDropdownOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.selectorBtnLeft}>
                      <Ionicons name="people-outline" size={16} color={COLORS.secondary} />
                      <Text style={styles.selectorBtnText} numberOfLines={1}>
                        {teamsForSelectedWs.find(t => t.id === selectedInviteTeamId)?.name || 'Choose Team'}
                      </Text>
                    </View>
                    <Ionicons name={teamDropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSubtle} />
                  </TouchableOpacity>

                  {teamDropdownOpen && (
                    <View style={styles.dropdownMenu}>
                      {teamsForSelectedWs.map(tm => {
                        const isSelected = tm.id === selectedInviteTeamId;
                        return (
                          <TouchableOpacity
                            key={tm.id}
                            style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                            onPress={() => {
                              setSelectedInviteTeamId(tm.id);
                              setTeamDropdownOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={styles.dropdownItemLeft}>
                              <Ionicons
                                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                size={15}
                                color={isSelected ? COLORS.secondary : COLORS.textMuted}
                              />
                              <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActiveCyan]}>
                                {tm.name}
                              </Text>
                            </View>
                            {tm.description ? (
                              <Text style={styles.dropdownItemSub} numberOfLines={1}>
                                {tm.description}
                              </Text>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

              {/* Email Address */}
              <Text style={styles.label}>3. Email Address</Text>
              <Controller
                control={inviteControl}
                name="email"
                rules={{
                  required: 'Email address is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Please enter a valid email address',
                  },
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, inviteErrors.email && styles.inputError]}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="colleague@company.com"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                )}
              />
              {inviteErrors.email && (
                <Text style={styles.errorText}>{inviteErrors.email.message}</Text>
              )}

              {/* Access Role */}
              <Text style={styles.label}>4. Access Role</Text>
              <Controller
                control={inviteControl}
                name="role"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.rolePickerRow}>
                    {(['member', 'admin'] as const).map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.roleChoice, value === r && styles.roleChoiceActive]}
                        onPress={() => onChange(r)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.roleChoiceText, value === r && styles.roleChoiceTextActive]}>
                          {r.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              />

              {/* 1-Hour Expiration Note */}
              <View style={styles.inviteNoticeBadge}>
                <Ionicons name="time-outline" size={15} color={COLORS.secondary} />
                <Text style={styles.inviteNoticeText}>
                  Invitation link expires in 1 hour. Existing users join immediately upon clicking; new users will set up their password on the web portal.
                </Text>
              </View>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setInviteModalVisible(false);
                    resetInviteForm();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, (!selectedInviteTeamId || teamsForSelectedWs.length === 0) && { opacity: 0.5 }]}
                  onPress={handleInviteSubmit(onSendInvite)}
                  disabled={inviting || !selectedInviteTeamId || teamsForSelectedWs.length === 0}
                  activeOpacity={0.8}
                >
                  {inviting ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.saveBtnText}>Send Invitation</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        visible={roleModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setRoleModalVisible(false);
          setSelectedMemberForRole(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIconBoxChangeRole}>
                  <Ionicons name="shield-checkmark" size={18} color={COLORS.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Change Member Role</Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    {selectedMemberForRole?.userName || selectedMemberForRole?.userEmail || 'Team Member'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  setRoleModalVisible(false);
                  setSelectedMemberForRole(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={COLORS.textSubtle} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Select the permission level for this member within this team vault:
            </Text>

            <View style={styles.roleSelectionContainer}>
              <TouchableOpacity
                style={[
                  styles.roleCardOption,
                  targetRole === 'member' && styles.roleCardOptionActive,
                ]}
                onPress={() => setTargetRole('member')}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardHeader}>
                  <View style={styles.roleCardRadio}>
                    {targetRole === 'member' && <View style={styles.roleCardRadioInner} />}
                  </View>
                  <Text style={[styles.roleCardTitle, targetRole === 'member' && styles.roleCardTitleActive]}>
                    Team Member
                  </Text>
                  <View style={[styles.roleTag, styles.roleMember, { marginLeft: 'auto' }]}>
                    <Text style={[styles.roleTagText, styles.roleTagTextMember]}>MEMBER</Text>
                  </View>
                </View>
                <Text style={styles.roleCardDesc}>
                  Can view team vaults, manage variables, and collaborate on shared environment secrets.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleCardOption,
                  targetRole === 'admin' && styles.roleCardOptionActiveCyan,
                ]}
                onPress={() => setTargetRole('admin')}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardHeader}>
                  <View style={[styles.roleCardRadio, targetRole === 'admin' && styles.roleCardRadioCyan]}>
                    {targetRole === 'admin' && (
                      <View style={[styles.roleCardRadioInner, { backgroundColor: COLORS.secondary }]} />
                    )}
                  </View>
                  <Text style={[styles.roleCardTitle, targetRole === 'admin' && styles.roleCardTitleActiveCyan]}>
                    Administrator
                  </Text>
                  <View style={[styles.roleTag, styles.roleAdmin, { marginLeft: 'auto' }]}>
                    <Text style={[styles.roleTagText, styles.roleTagTextAdmin]}>ADMIN</Text>
                  </View>
                </View>
                <Text style={styles.roleCardDesc}>
                  Full administrative permissions. Can invite members, update roles, and manage team members.
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setRoleModalVisible(false);
                  setSelectedMemberForRole(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: COLORS.secondary }]}
                onPress={handleUpdateRole}
                disabled={updatingRole}
                activeOpacity={0.8}
              >
                {updatingRole ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Role</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
                    {team?.name || 'Current Team'}
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
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 16,
  },
  actionBanner: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  inviteBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
  },
  refreshSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  refreshSectionBtnText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  memberCardWrapper: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  ownerBadgeText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  youBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  youBadgeText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  memberActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    gap: 8,
  },
  actionBtnRole: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionBtnRoleText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionBtnDeleteText: {
    color: COLORS.error,
    fontSize: 11,
    fontWeight: '700',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarOwner: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  avatarAdmin: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  avatarMember: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: COLORS.border,
  },
  avatarText: {
    fontWeight: '800',
    fontSize: 16,
  },
  avatarTextOwner: {
    color: COLORS.primary,
  },
  avatarTextAdmin: {
    color: COLORS.secondary,
  },
  avatarTextMember: {
    color: COLORS.textSubtle,
  },
  memberInfo: {
    flex: 1,
    marginRight: 8,
  },
  memberName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  memberEmail: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  joinedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  joinedDateText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  roleDotOwner: {
    backgroundColor: COLORS.primary,
  },
  roleDotAdmin: {
    backgroundColor: COLORS.secondary,
  },
  roleDotMember: {
    backgroundColor: COLORS.textMuted,
  },
  roleOwner: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  roleAdmin: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  roleMember: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: COLORS.border,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  roleTagTextOwner: {
    color: COLORS.primary,
  },
  roleTagTextAdmin: {
    color: COLORS.secondary,
  },
  roleTagTextMember: {
    color: COLORS.textSubtle,
  },
  noInvitesText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 8,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  // Redesigned Pending Invites Styles
  invitesSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  invitesSectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  invitesSectionIconBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  invitesSectionHeader: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  invitesCountBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  invitesCountText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: '800',
  },
  invitesQuickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
  },
  invitesQuickAddBtnText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyInvitesCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  emptyInvitesIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyInvitesTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyInvitesDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
  },
  redesignedInviteCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  inviteCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteAvatarBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  inviteAvatarText: {
    color: COLORS.warning,
    fontSize: 16,
    fontWeight: '800',
  },
  inviteInfoBox: {
    flex: 1,
    marginRight: 8,
  },
  inviteEmailText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  inviteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  inviteRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  inviteRolePillAdmin: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  inviteRolePillMember: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: COLORS.border,
  },
  inviteRoleDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  inviteRoleDotAdmin: {
    backgroundColor: COLORS.secondary,
  },
  inviteRoleDotMember: {
    backgroundColor: COLORS.textMuted,
  },
  inviteRoleText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inviteRoleTextAdmin: {
    color: COLORS.secondary,
  },
  inviteRoleTextMember: {
    color: COLORS.textSubtle,
  },
  inviteMetaBullet: {
    color: COLORS.textMuted,
    marginHorizontal: 6,
    fontSize: 11,
  },
  inviteDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteDateText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  inviteStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.28)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  inviteStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.warning,
    marginRight: 5,
  },
  inviteStatusLabel: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inviteActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  copyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  copyLinkBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  inviteLinkHintText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
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
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalIconBoxInvite: {
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
  modalIconBoxChangeRole: {
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
  modalDescription: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  roleSelectionContainer: {
    gap: 10,
    marginBottom: 8,
  },
  roleCardOption: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  roleCardOptionActive: {
    borderColor: COLORS.textMuted,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  roleCardOptionActiveCyan: {
    borderColor: COLORS.secondary,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  roleCardRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  roleCardRadioCyan: {
    borderColor: COLORS.secondary,
  },
  roleCardRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.textSubtle,
  },
  roleCardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  roleCardTitleActive: {
    color: COLORS.text,
  },
  roleCardTitleActiveCyan: {
    color: COLORS.secondary,
  },
  roleCardDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 28,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSubtle,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
  },
  rolePickerRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  roleChoice: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 6,
  },
  roleChoiceActive: {
    backgroundColor: COLORS.secondaryGlow,
    borderColor: COLORS.secondary,
  },
  roleChoiceText: {
    color: COLORS.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  roleChoiceTextActive: {
    color: COLORS.secondary,
  },
  modalBtnRow: {
    flexDirection: 'row',
    marginTop: 20,
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
    marginTop: 4,
  },
  manageTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 8,
  },
  manageTeamBtnText: {
    color: COLORS.secondary,
    fontWeight: '800',
    fontSize: 13,
  },
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
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  selectorBtnOpen: {
    borderColor: COLORS.primary,
  },
  selectorBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  selectorBtnText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  dropdownMenu: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
    maxHeight: 160,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dropdownItemText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  dropdownItemTextActiveCyan: {
    color: COLORS.secondary,
    fontWeight: '700',
  },
  dropdownItemSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    maxWidth: 120,
  },
  emptyNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  emptyNoticeText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '500',
  },
  inviteNoticeBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    marginBottom: 14,
    gap: 8,
  },
  inviteNoticeText: {
    color: COLORS.secondary,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
});
