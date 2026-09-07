import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  ActivityIndicator,
  Text,
  Alert,
  AppState,
  Linking,
  Animated,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TourProvider, useTour } from 'guideway';
import {
  ALL_TOURS,
  guidewayTheme,
  tourStorage,
  hasSeenTour,
  markTourSeen,
  TOUR_IDS,
} from './src/tour/tours';
import { useGsapTabTransition } from './src/utils/gsapAnimation';
import { AuthScreen } from './src/screens/AuthScreen';
import { EnvVaultScreen } from './src/screens/EnvVaultScreen';
import { TeamScreen } from './src/screens/TeamScreen';
import { Header } from './src/components/Header';
import { CreateWorkspaceModal } from './src/components/CreateWorkspaceModal';
import { CreateTeamModal } from './src/components/CreateTeamModal';
import { AccountModal } from './src/components/AccountModal';
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
  setApiBaseUrl,
} from './src/utils/apiClient';
import { AlertProvider, showCustomAlert } from './src/components/CustomAlert';
import { ServerLoadingIndicator } from './src/components/ServerLoadingIndicator';
import { Skeleton } from './src/components/Skeleton';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';
if (!API_BASE_URL) {
  console.warn('⚠️ EXPO_PUBLIC_API_URL is missing. Please configure it in your .env file.');
} else {
  setApiBaseUrl(API_BASE_URL);
}

interface User {
  id: string;
  email: string;
  name: string;
  role?: 'admin' | 'member';
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId?: string;
}

interface Team {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  createdBy?: string;
}

function MainApp() {
  const { start } = useTour();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // Active Selections
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'envs' | 'team'>('envs');
  const { animatedStyle: tabAnimatedStyle } = useGsapTabTransition(activeTab);

  // Modals
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  // Refresh Keys & Data State
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshTrigger(prev => prev + 1);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 700);
  };

  const handleUserUpdated = async (updatedUser: User) => {
    setUser(updatedUser);
    const session = await getAuthSession();
    if (session) {
      await saveAuthSession({
        ...session,
        user: updatedUser,
      });
    }
  };

  const handleWorkspaceUpdated = (updatedWs: { id: string; name: string; slug: string; ownerId?: string }) => {
    setWorkspaces(prev => prev.map(w => (w.id === updatedWs.id ? { ...w, ...updatedWs } : w)));
  };

  const handleWorkspaceDeleted = (deletedWsId: string) => {
    setWorkspaces(prev => {
      const next = prev.filter(w => w.id !== deletedWsId);
      if (activeWorkspaceId === deletedWsId) {
        setActiveWorkspaceId(next.length > 0 ? next[0].id : '');
      }
      return next;
    });
  };

  const handleTeamUpdated = (updatedTeam: { id: string; workspaceId?: string; name: string; description?: string; createdBy?: string }) => {
    setTeams(prev => prev.map(t => (t.id === updatedTeam.id ? { ...t, ...updatedTeam } : t)));
  };

  const handleTeamDeleted = (deletedTeamId: string) => {
    setTeams(prev => {
      const next = prev.filter(t => t.id !== deletedTeamId);
      if (activeTeamId === deletedTeamId) {
        setActiveTeamId(next.length > 0 ? next[0].id : '');
      }
      return next;
    });
  };

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

    // Automatically trigger Guideway onboarding tour for new/first-time users
    try {
      const seen = await hasSeenTour(TOUR_IDS.WELCOME, newUser.id);
      if (!seen) {
        setTimeout(() => {
          start(TOUR_IDS.WELCOME);
          markTourSeen(TOUR_IDS.WELCOME, newUser.id);
        }, 800);
      }
    } catch (e) {
      console.log('Error triggering onboarding tour:', e);
    }
  };

  const handleStartTour = () => {
    if (activeTab === 'team') {
      start(TOUR_IDS.TEAM);
    } else {
      start(TOUR_IDS.VAULT);
    }
  };

  const handleReplayWelcomeTour = () => {
    start(TOUR_IDS.WELCOME);
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

    showCustomAlert({
      title: 'Log Out',
      message: 'Are you sure you want to log out of Env Vault on this device?',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: executeLogout,
        },
      ],
    });
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

          // Verify session in background asynchronously without blocking session restoration
          apiClient
            .get(`${API_BASE_URL}/trpc/auth.me`)
            .then(res => {
              if (res.data?.result?.data?.user) {
                setUser(res.data.result.data.user);
              }
            })
            .catch(e => {
              console.log('Background token verification notice:', e);
            });
        }
      } catch (err) {
        console.log('Error restoring auth session:', err);
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSavedSession();
  }, []);

  // Auto-refresh user profile when returning to the app (e.g. after email verification)
  useEffect(() => {
    if (!token) return;

    const handleRefreshUser = () => {
      apiClient
        .get(`${API_BASE_URL}/trpc/auth.me`)
        .then((res) => {
          if (res.data?.result?.data?.user) {
            const updated = res.data.result.data.user;
            setUser(updated);
            handleUserUpdated(updated);
          }
        })
        .catch(() => {});
    };

    const stateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        handleRefreshUser();
      }
    });

    const linkSub = Linking.addEventListener('url', () => {
      handleRefreshUser();
    });

    return () => {
      stateSub.remove();
      linkSub.remove();
    };
  }, [token]);

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

  return (
    <>
      <ServerLoadingIndicator />
      {!API_BASE_URL ? (
          <SafeAreaView style={styles.splashContainer} edges={['top', 'left', 'right', 'bottom']}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
            <Text style={{ fontSize: 36, marginBottom: 16 }}>⚠️</Text>
            <Text style={[styles.splashText, { fontWeight: '800', color: COLORS.danger, marginBottom: 8 }]}>
              Configuration Required
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', maxWidth: 300, lineHeight: 22 }}>
              EXPO_PUBLIC_API_URL is missing. Please configure it in your environment file before running the app.
            </Text>
          </SafeAreaView>
        ) : isRestoringSession ? (
          <SafeAreaView style={styles.splashContainer} edges={['top', 'left', 'right', 'bottom']}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.splashText}>Restoring Secure Vault...</Text>
            <View style={{ width: 180, marginTop: 16 }}>
              <Skeleton width="100%" height={8} borderRadius={4} />
            </View>
          </SafeAreaView>
        ) : !token || !user ? (
          <AuthScreen onLoginSuccess={handleLoginSuccess} apiBaseUrl={API_BASE_URL} />
        ) : (
          <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

            {/* App Header */}
            <Header
              user={user}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onSelectWorkspace={setActiveWorkspaceId}
              onOpenCreateWorkspace={() => setWsModalOpen(true)}
              onWorkspaceUpdated={handleWorkspaceUpdated}
              onWorkspaceDeleted={handleWorkspaceDeleted}
              teams={teams}
              activeTeamId={activeTeamId}
              onSelectTeam={setActiveTeamId}
              onOpenCreateTeam={() => setTeamModalOpen(true)}
              onTeamUpdated={handleTeamUpdated}
              onTeamDeleted={handleTeamDeleted}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onSignOut={handleSignOut}
              onOpenAccount={() => setAccountModalOpen(true)}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              onStartTour={handleStartTour}
              token={token}
              apiBaseUrl={API_BASE_URL}
            />

            {/* Main Body Content with GSAP Smooth Transition */}
            <View style={styles.body}>
              <Animated.View style={tabAnimatedStyle} key={activeTab}>
                {activeTab === 'envs' ? (
                  <EnvVaultScreen
                    token={token}
                    workspaceId={activeWorkspaceId}
                    teamId={activeTeamId}
                    workspace={workspaces.find(w => w.id === activeWorkspaceId)}
                    team={teams.find(t => t.id === activeTeamId)}
                    apiBaseUrl={API_BASE_URL}
                    user={user}
                    refreshTrigger={refreshTrigger}
                  />
                ) : (
                  <TeamScreen
                    token={token}
                    workspaceId={activeWorkspaceId}
                    teamId={activeTeamId}
                    team={teams.find(t => t.id === activeTeamId)}
                    workspaces={workspaces}
                    allTeams={teams}
                    apiBaseUrl={API_BASE_URL}
                    user={user}
                    refreshTrigger={refreshTrigger}
                    onTeamUpdated={handleTeamUpdated}
                    onTeamDeleted={handleTeamDeleted}
                  />
                )}
              </Animated.View>
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

            {/* Account Information, Redeem Code & Security Modal */}
            <AccountModal
              visible={accountModalOpen}
              onClose={() => setAccountModalOpen(false)}
              user={user}
              apiBaseUrl={API_BASE_URL}
              onUserUpdated={handleUserUpdated}
              onReplayTour={handleReplayWelcomeTour}
            />
          </SafeAreaView>
        )}
    </>
  );
}

function AppWithTour() {
  const insets = useSafeAreaInsets();

  return (
    <TourProvider
      tours={ALL_TOURS}
      theme={guidewayTheme}
      colorScheme="dark"
      insets={insets}
      storage={tourStorage}
      defaultCutout={{ shape: 'rounded', radius: 10, padding: 6 }}
      overlayTapBehavior="next"
    >
      <AlertProvider>
        <MainApp />
      </AlertProvider>
    </TourProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppWithTour />
    </SafeAreaProvider>
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
