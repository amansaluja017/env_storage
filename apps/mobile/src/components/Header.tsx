import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '../theme';

interface HeaderProps {
  user: { id: string; name: string; email: string };
  workspaces: Array<{ id: string; name: string; slug: string }>;
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenCreateWorkspace: () => void;

  teams: Array<{ id: string; name: string; description?: string }>;
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  onOpenCreateTeam: () => void;

  activeTab: 'envs' | 'team';
  onSelectTab: (tab: 'envs' | 'team') => void;
  onSignOut: () => void;
}

export function Header({
  user,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenCreateWorkspace,
  teams,
  activeTeamId,
  onSelectTeam,
  onOpenCreateTeam,
  activeTab,
  onSelectTab,
  onSignOut,
}: HeaderProps) {
  const currentWs = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];
  const currentTeam = teams.find(t => t.id === activeTeamId) || teams[0];

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <View style={styles.badgeIcon}>
            <Text style={styles.badgeText}>⚡</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>TUBO</Text>
            <Text style={styles.brandSubtitle}>Env Vault & SQLite Engine</Text>
          </View>
        </View>

        <View style={styles.userControls}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </Text>
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut}>
            <Text style={styles.signOutText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Workspace Selector Bar */}
      <View style={styles.selectorSection}>
        <Text style={styles.sectionLabel}>WORKSPACE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
          {workspaces.map(ws => {
            const isActive = ws.id === activeWorkspaceId;
            return (
              <TouchableOpacity
                key={ws.id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => onSelectWorkspace(ws.id)}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  🏢 {ws.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.addChip} onPress={onOpenCreateWorkspace}>
            <Text style={styles.addChipText}>+ New Workspace</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Team Selector Bar */}
      <View style={styles.selectorSection}>
        <Text style={styles.sectionLabel}>TEAM</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
          {teams.map(t => {
            const isActive = t.id === activeTeamId;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.chip, isActive && styles.chipActiveTeam]}
                onPress={() => onSelectTeam(t.id)}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActiveTeam]}>
                  👥 {t.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.addChip} onPress={onOpenCreateTeam}>
            <Text style={styles.addChipText}>+ New Team</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'envs' && styles.tabButtonActive]}
          onPress={() => onSelectTab('envs')}
        >
          <Text style={[styles.tabText, activeTab === 'envs' && styles.tabTextActive]}>
            🔐 SQLite Env Storage
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'team' && styles.tabButtonActive]}
          onPress={() => onSelectTab('team')}
        >
          <Text style={[styles.tabText, activeTab === 'team' && styles.tabTextActive]}>
            👥 Team Members & Sharing
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    paddingTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  badgeText: {
    fontSize: 18,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  userControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryGlow,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 14,
  },
  signOutBtn: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  signOutText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  selectorSection: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  scrollRow: {
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primaryGlow,
    borderColor: COLORS.primary,
  },
  chipActiveTeam: {
    backgroundColor: COLORS.secondaryGlow,
    borderColor: COLORS.secondary,
  },
  chipText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  chipTextActiveTeam: {
    color: COLORS.secondary,
    fontWeight: '700',
  },
  addChip: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
  },
  addChipText: {
    color: COLORS.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 4,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
});
