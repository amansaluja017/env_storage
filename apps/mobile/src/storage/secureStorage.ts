import * as SecureStore from 'expo-secure-store';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'tubo_auth_access_token';
const REFRESH_TOKEN_KEY = 'tubo_auth_refresh_token';
const USER_SESSION_KEY = 'tubo_auth_user_session';

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: UserInfo;
}

// In-memory store fallback when running in Expo Go or Web environments
const memoryStore: Record<string, string> = {};

/**
 * Checks if the app is running inside Expo Go
 */
export function isExpoGo(): boolean {
  if (Platform.OS === 'web') return false;
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants.executionEnvironment as string) === 'storeClient'
  );
}

/**
 * Determines whether SecureStore should be utilized:
 * Per user instruction: "if app running on expo go don't store in the secure storage"
 */
export function shouldUseSecureStore(): boolean {
  if (isExpoGo()) {
    return false;
  }
  if (Platform.OS === 'web') {
    return false;
  }
  return true;
}

/**
 * Persist authentication session
 */
export async function saveAuthSession(session: AuthSession): Promise<void> {
  const userJson = JSON.stringify(session.user);

  if (shouldUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken);
      await SecureStore.setItemAsync(USER_SESSION_KEY, userJson);
      return;
    } catch (err) {
      console.warn('SecureStore save failed, using memory fallback:', err);
    }
  }

  // Fallback for Expo Go and Web
  memoryStore[ACCESS_TOKEN_KEY] = session.accessToken;
  memoryStore[REFRESH_TOKEN_KEY] = session.refreshToken;
  memoryStore[USER_SESSION_KEY] = userJson;
}

/**
 * Retrieve saved authentication session
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let userJson: string | null = null;

  if (shouldUseSecureStore()) {
    try {
      accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      userJson = await SecureStore.getItemAsync(USER_SESSION_KEY);
    } catch (err) {
      console.warn('SecureStore read failed:', err);
    }
  } else {
    accessToken = memoryStore[ACCESS_TOKEN_KEY] || null;
    refreshToken = memoryStore[REFRESH_TOKEN_KEY] || null;
    userJson = memoryStore[USER_SESSION_KEY] || null;
  }

  if (!accessToken || !refreshToken || !userJson) {
    return null;
  }

  try {
    const user = JSON.parse(userJson) as UserInfo;
    return { accessToken, refreshToken, user };
  } catch {
    return null;
  }
}

/**
 * Update access token (and optionally refresh token) after token renewal
 */
export async function updateAccessToken(newAccessToken: string, newRefreshToken?: string): Promise<void> {
  if (shouldUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken);
      if (newRefreshToken) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);
      }
      return;
    } catch (err) {
      console.warn('SecureStore update token failed:', err);
    }
  }

  memoryStore[ACCESS_TOKEN_KEY] = newAccessToken;
  if (newRefreshToken) {
    memoryStore[REFRESH_TOKEN_KEY] = newRefreshToken;
  }
}

/**
 * Clear stored authentication session on sign out
 */
export async function clearAuthSession(): Promise<void> {
  if (shouldUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_SESSION_KEY);
    } catch (err) {
      console.warn('SecureStore clear failed:', err);
    }
  }

  delete memoryStore[ACCESS_TOKEN_KEY];
  delete memoryStore[REFRESH_TOKEN_KEY];
  delete memoryStore[USER_SESSION_KEY];
}
