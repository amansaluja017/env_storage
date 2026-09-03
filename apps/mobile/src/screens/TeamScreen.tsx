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
} from 'react-native';
import { COLORS } from '../theme';

interface TeamMember {
  id: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  userName?: string;
  userEmail?: string;
}

interface TeamInvite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  inviteCode: string;
  status: 'pending' | 'accepted' | 'expired';
}

interface TeamScreenProps {
  token: string;
  workspaceId: string;
  teamId: string;
  apiBaseUrl: string;
}

export function TeamScreen({ token, workspaceId, teamId, apiBaseUrl }: TeamScreenProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(false);

  // Invite Modal State
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);

  // Accept Invite Modal State
  const [acceptModalVisible, setAcceptModalVisible] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [accepting, setAccepting] = useState(false);

  const fetchTeamData = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      // Fetch members
      const mRes = await fetch(
        `${apiBaseUrl}/trpc/team.getMembers?input=${encodeURIComponent(JSON.stringify({ teamId }))}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const mData = await mRes.json();
      if (mData.result?.data) setMembers(mData.result.data);

      // Fetch invites
      const iRes = await fetch(
        `${apiBaseUrl}/trpc/team.getInvites?input=${encodeURIComponent(JSON.stringify({ teamId }))}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const iData = await iRes.json();
      if (iData.result?.data) setInvites(iData.result.data);
    } catch (e) {
      console.log('Error fetching team:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [teamId, token]);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    setInviting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/trpc/team.inviteMember`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId,
          workspaceId,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (data.result?.data) {
        Alert.alert('Invite Sent!', `Created invite code: ${data.result.data.inviteCode}`);
        setInviteModalVisible(false);
        setInviteEmail('');
        fetchTeamData();
      } else {
        throw new Error(data.error?.message || 'Failed to send invite');
      }
    } catch (e: any) {
      Alert.alert('Invite Failed', e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!inviteCodeInput.trim()) return;
    setAccepting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/trpc/team.acceptInvite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          inviteCode: inviteCodeInput.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (data.result?.data) {
        Alert.alert('Joined Team!', 'You have successfully joined the team!');
        setAcceptModalVisible(false);
        setInviteCodeInput('');
        fetchTeamData();
      } else {
        throw new Error(data.error?.message || 'Invalid or expired invite code');
      }
    } catch (e: any) {
      Alert.alert('Failed to Join', e.message);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Banner Actions */}
      <View style={styles.actionBanner}>
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => setInviteModalVisible(true)}
        >
          <Text style={styles.inviteBtnText}>+ Invite Team Member</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.codeBtn}
          onPress={() => setAcceptModalVisible(true)}
        >
          <Text style={styles.codeBtnText}>🔑 Redeem Code</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loadingText}>Fetching team roster & invites...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Members List */}
          <Text style={styles.sectionHeader}>ACTIVE TEAM MEMBERS ({members.length})</Text>
          {members.map(m => (
            <View key={m.id} style={styles.memberCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(m.userName || 'M').charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.userName || 'Team Member'}</Text>
                <Text style={styles.memberEmail}>{m.userEmail || m.userId}</Text>
              </View>

              <View
                style={[
                  styles.roleTag,
                  m.role === 'owner'
                    ? styles.roleOwner
                    : m.role === 'admin'
                    ? styles.roleAdmin
                    : styles.roleMember,
                ]}
              >
                <Text style={styles.roleTagText}>{m.role.toUpperCase()}</Text>
              </View>
            </View>
          ))}

          {/* Pending Invites List */}
          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>
            PENDING INVITES ({invites.filter(i => i.status === 'pending').length})
          </Text>

          {invites.length === 0 ? (
            <Text style={styles.noInvitesText}>No pending invitations</Text>
          ) : (
            invites.map(inv => (
              <View key={inv.id} style={styles.inviteCard}>
                <View>
                  <Text style={styles.inviteEmail}>{inv.email}</Text>
                  <Text style={styles.inviteCode}>Code: {inv.inviteCode}</Text>
                </View>
                <View style={styles.inviteStatusBadge}>
                  <Text style={styles.inviteStatusText}>{inv.status.toUpperCase()}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Invite Modal */}
      <Modal visible={inviteModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Invite Team Member</Text>
            <Text style={styles.modalSubtitle}>
              Send an invitation to join this team's environment vault.
            </Text>

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="colleague@company.com"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Access Role</Text>
            <View style={styles.rolePickerRow}>
              {(['member', 'admin'] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleChoice, inviteRole === r && styles.roleChoiceActive]}
                  onPress={() => setInviteRole(r)}
                >
                  <Text style={[styles.roleChoiceText, inviteRole === r && styles.roleChoiceTextActive]}>
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setInviteModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSendInvite}
                disabled={inviting}
              >
                {inviting ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>Send Invitation</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Accept Invite Modal */}
      <Modal visible={acceptModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Redeem Invite Code</Text>
            <Text style={styles.modalSubtitle}>
              Enter the invite code shared with you by your team lead.
            </Text>

            <Text style={styles.label}>Invite Code</Text>
            <TextInput
              style={styles.input}
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              placeholder="e.g. INV-TUBO-9921"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setAcceptModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleAcceptInvite}
                disabled={accepting}
              >
                {accepting ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>Join Team</Text>
                )}
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
  actionBanner: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  inviteBtn: {
    flex: 1,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  inviteBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 13,
  },
  codeBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  codeBtnText: {
    color: COLORS.textSubtle,
    fontWeight: '700',
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
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: COLORS.secondary,
    fontWeight: '800',
    fontSize: 16,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  memberEmail: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleOwner: {
    backgroundColor: COLORS.primaryGlow,
    borderColor: COLORS.primary,
  },
  roleAdmin: {
    backgroundColor: COLORS.secondaryGlow,
    borderColor: COLORS.secondary,
  },
  roleMember: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  roleTagText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '800',
  },
  noInvitesText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  inviteCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 8,
  },
  inviteEmail: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  inviteCode: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  inviteStatusBadge: {
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inviteStatusText: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '800',
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
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
    marginTop: 2,
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
});
