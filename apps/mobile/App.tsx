import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Text,
  Alert,
} from 'react-native';
import { AuthScreen } from './src/screens/AuthScreen';
import { EnvVaultScreen } from './src/screens/EnvVaultScreen';
import { TeamScreen } from './src/screens/TeamScreen';
import { Header } from './src/components/Header';
import { CreateWorkspaceModal } from './src/components/CreateWorkspaceModal';
import { CreateTeamModal } from './src/components/CreateTeamModal';
import { COLORS } from './src/theme';
import {
  saveAuthSession,
  getAuthSession,
  clearAuthSession,
  shouldUseSecureStore,
} from './src/storage/secureStorage';
import {
  setActiveTokens,
  getActiveRefreshToken,
  registerAuthCallbacks,
  apiClient,
} from './src/utils/apiClient';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL &&
  !process.env.EXPO_PUBLIC_API_URL.includes('localhost')
    ? process.env.EXPO_PUBLIC_API_URL
    : 'http://10.220.109.189:4000';

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
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // Active Selections
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'envs' | 'team'>('envs');

  // Modals
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);

  const handleLoginSuccess = async (
    newAccessToken: string,
    newRefreshToken: string,
    newUser: User
  ) => {
    setToken(newAccessToken);
    setUser(newUser);
    setActiveTokens({ accessToken: newAccessToken, refreshToken: newRefreshToken });

    await saveAuthSession({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: newUser,
    });
  };

  const executeLogout = async () => {
    try {
      const currentRefreshToken = getActiveRefreshToken();
      if (currentRefreshToken || token) {
        await apiClient
          .post(`${API_BASE_URL}/trpc/auth.logout`, {
            refreshToken: currentRefreshToken || undefined,
          })
          .catch(e => console.log('Remote logout notification skipped:', e.message));
      }
    } catch {
      // ignore network errors on logout
    } finally {
      setToken(null);
      setUser(null);
      setWorkspaces([]);
      setTeams([]);
      setActiveWorkspaceId('');
      setActiveTeamId('');
      setActiveTokens({ accessToken: null, refreshToken: null });
      await clearAuthSession();
    }
  };

  const handleSignOut = (skipConfirmation: boolean = false) => {
    if (skipConfirmation) {
      executeLogout();
      return;
    }

    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of Tubo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: executeLogout,
        },
      ]
    );
  };

  // 1. Initial Session Restore & Auto-Refresh Setup
  useEffect(() => {
    // Register auto-renewal callbacks
    registerAuthCallbacks({
      onSessionExpired: () => {
        console.log('Session expired, logging out user...');
        handleSignOut(true);
      },
      onTokenUpdated: (newAccessToken: string) => {
        console.log('Token renewed automatically in App state');
        setToken(newAccessToken);
      },
    });

    const restoreSavedSession = async () => {
      try {
        const isSecure = shouldUseSecureStore();
        console.log(`🔐 Storage Driver: ${isSecure ? 'Native SecureStore' : 'In-Memory (Expo Go bypass active)'}`);

        const savedSession = await getAuthSession();
        if (savedSession?.accessToken && savedSession?.user) {
          setActiveTokens({
            accessToken: savedSession.accessToken,
            refreshToken: savedSession.refreshToken,
          });
          setToken(savedSession.accessToken);
          setUser(savedSession.user);

          // Verify session in background
          try {
            const res = await apiClient.get(`${API_BASE_URL}/trpc/auth.me`);
            if (res.data?.result?.data?.user) {
              setUser(res.data.result.data.user);
            }
          } catch (e) {
            console.log('Background token verification notice:', e);
          }
        }
      } catch (err) {
        console.log('Error restoring auth session:', err);
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSavedSession();
  }, []);

  // 2. Fetch Workspaces on Login / Token Change
  useEffect(() => {
    if (!token) return;

    const fetchWorkspaces = async () => {
      try {
        const res = await apiClient.get(`${API_BASE_URL}/trpc/workspace.list`);
        if (res.data?.result?.data) {
          const list: Workspace[] = res.data.result.data;
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

  // 3. Fetch Teams when active workspace changes
  useEffect(() => {
    if (!token || !activeWorkspaceId) return;

    const fetchTeams = async () => {
      try {
        const res = await apiClient.get(`${API_BASE_URL}/trpc/team.list`, {
          params: { input: JSON.stringify({ workspaceId: activeWorkspaceId }) },
        });
        if (res.data?.result?.data) {
          const list: Team[] = res.data.result.data;
          setTeams(list);
          if (list.length > 0) {
            if (!list.some(t => t.id === activeTeamId)) {
              setActiveTeamId(list[0].id);
            }
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

  if (isRestoringSession) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.splashText}>Restoring Secure Vault...</Text>
      </View>
    );
  }

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
            user={user}
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
  splashContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  body: {
    flex: 1,
  },
});
