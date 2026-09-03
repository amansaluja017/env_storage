import React, { useState, useEffect } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, Text } from 'react-native';
import { AuthScreen } from './src/screens/AuthScreen';
import { EnvVaultScreen } from './src/screens/EnvVaultScreen';
import { TeamScreen } from './src/screens/TeamScreen';
import { Header } from './src/components/Header';
import { CreateWorkspaceModal } from './src/components/CreateWorkspaceModal';
import { CreateTeamModal } from './src/components/CreateTeamModal';
import { COLORS } from './src/theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface Team {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Active Selections
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'envs' | 'team'>('envs');

  // Modals
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);

  const handleLoginSuccess = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleSignOut = () => {
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setTeams([]);
  };

  // Fetch Workspaces on Login
  useEffect(() => {
    if (!token) return;

    const fetchWorkspaces = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/trpc/workspace.list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.result?.data) {
          const list: Workspace[] = data.result.data;
          setWorkspaces(list);
          if (list.length > 0 && !activeWorkspaceId) {
            setActiveWorkspaceId(list[0].id);
          }
        }
      } catch (e) {
        console.log('Error fetching workspaces:', e);
      }
    };

    fetchWorkspaces();
  }, [token]);

  // Fetch Teams when active workspace changes
  useEffect(() => {
    if (!token || !activeWorkspaceId) return;

    const fetchTeams = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/trpc/team.list?input=${encodeURIComponent(
            JSON.stringify({ workspaceId: activeWorkspaceId })
          )}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.result?.data) {
          const list: Team[] = data.result.data;
          setTeams(list);
          if (list.length > 0) {
            setActiveTeamId(list[0].id);
          } else {
            setActiveTeamId('');
          }
        }
      } catch (e) {
        console.log('Error fetching teams:', e);
      }
    };

    fetchTeams();
  }, [token, activeWorkspaceId]);

  if (!token || !user) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} apiBaseUrl={API_BASE_URL} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* App Header */}
      <Header
        user={user}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={setActiveWorkspaceId}
        onOpenCreateWorkspace={() => setWsModalOpen(true)}
        teams={teams}
        activeTeamId={activeTeamId}
        onSelectTeam={setActiveTeamId}
        onOpenCreateTeam={() => setTeamModalOpen(true)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSignOut={handleSignOut}
      />

      {/* Main Body Content */}
      <View style={styles.body}>
        {activeTab === 'envs' ? (
          <EnvVaultScreen
            token={token}
            workspaceId={activeWorkspaceId}
            teamId={activeTeamId}
            apiBaseUrl={API_BASE_URL}
          />
        ) : (
          <TeamScreen
            token={token}
            workspaceId={activeWorkspaceId}
            teamId={activeTeamId}
            apiBaseUrl={API_BASE_URL}
          />
        )}
      </View>

      {/* Workspace Creation Modal */}
      <CreateWorkspaceModal
        visible={wsModalOpen}
        onClose={() => setWsModalOpen(false)}
        token={token}
        apiBaseUrl={API_BASE_URL}
        onCreated={newWs => {
          setWorkspaces(prev => [...prev, newWs]);
          setActiveWorkspaceId(newWs.id);
        }}
      />

      {/* Team Creation Modal */}
      <CreateTeamModal
        visible={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        workspaceId={activeWorkspaceId}
        token={token}
        apiBaseUrl={API_BASE_URL}
        onCreated={newTeam => {
          setTeams(prev => [...prev, newTeam]);
          setActiveTeamId(newTeam.id);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  body: {
    flex: 1,
  },
});
