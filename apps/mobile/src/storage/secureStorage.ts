import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'env_auth_access_token';
const LEGACY_ACCESS_TOKEN_KEY = 'tubo_auth_access_token';
const REFRESH_TOKEN_KEY = 'env_auth_refresh_token';
const LEGACY_REFRESH_TOKEN_KEY = 'tubo_auth_refresh_token';
const USER_SESSION_KEY = 'env_auth_user_session';
const LEGACY_USER_SESSION_KEY = 'tubo_auth_user_session';

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

// In-memory store fallback when running in Web environments or when storage is restricted
const memoryStore: Record<string, string> = {};

/**
 * Web / fallback storage helpers
 */
function getWebOrMemoryItem(key: string): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // localStorage restricted
    }
  }
  return memoryStore[key] ?? null;
}

function setWebOrMemoryItem(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // localStorage restricted
    }
  }
  memoryStore[key] = value;
}

function removeWebOrMemoryItem(key: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // localStorage restricted
    }
  }
  delete memoryStore[key];
}

/**
 * Determines whether native SecureStore should be utilized:
 * Always enabled on native mobile (iOS Keychain & Android Keystore),
 * falls back to localStorage/memory only on Web.
 */
export function shouldUseSecureStore(): boolean {
  if (Platform.OS === 'web') {
    return false;
  }
  return true;
}

/**
 * Persist authentication session (access token, refresh token, and user profile)
 * securely using native hardware-backed encryption.
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
      console.warn('SecureStore save failed, using fallback:', err);
    }
  }

  // Fallback for Web / restricted environments
  setWebOrMemoryItem(ACCESS_TOKEN_KEY, session.accessToken);
  setWebOrMemoryItem(REFRESH_TOKEN_KEY, session.refreshToken);
  setWebOrMemoryItem(USER_SESSION_KEY, userJson);
}

/**
 * Retrieve saved authentication session from native secure storage
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let userJson: string | null = null;

  if (shouldUseSecureStore()) {
    try {
      accessToken = (await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)) || (await SecureStore.getItemAsync(LEGACY_ACCESS_TOKEN_KEY));
      refreshToken = (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) || (await SecureStore.getItemAsync(LEGACY_REFRESH_TOKEN_KEY));
      userJson = (await SecureStore.getItemAsync(USER_SESSION_KEY)) || (await SecureStore.getItemAsync(LEGACY_USER_SESSION_KEY));
    } catch (err) {
      console.warn('SecureStore read failed:', err);
    }
  }

  // Fall back to web/memory store if missing from SecureStore
  accessToken = accessToken || getWebOrMemoryItem(ACCESS_TOKEN_KEY) || getWebOrMemoryItem(LEGACY_ACCESS_TOKEN_KEY);
  refreshToken = refreshToken || getWebOrMemoryItem(REFRESH_TOKEN_KEY) || getWebOrMemoryItem(LEGACY_REFRESH_TOKEN_KEY);
  userJson = userJson || getWebOrMemoryItem(USER_SESSION_KEY) || getWebOrMemoryItem(LEGACY_USER_SESSION_KEY);

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
 * Save access token and refresh token directly to secure storage
 */
export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  if (shouldUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
      return;
    } catch (err) {
      console.warn('SecureStore saveTokens failed:', err);
    }
  }
  setWebOrMemoryItem(ACCESS_TOKEN_KEY, accessToken);
  setWebOrMemoryItem(REFRESH_TOKEN_KEY, refreshToken);
}

/**
 * Retrieve access token from secure storage
 */
export async function getStoredAccessToken(): Promise<string | null> {
  if (shouldUseSecureStore()) {
    try {
      const val = (await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)) || (await SecureStore.getItemAsync(LEGACY_ACCESS_TOKEN_KEY));
      if (val) return val;
    } catch (err) {
      console.warn('SecureStore getStoredAccessToken failed:', err);
    }
  }
  return getWebOrMemoryItem(ACCESS_TOKEN_KEY) || getWebOrMemoryItem(LEGACY_ACCESS_TOKEN_KEY);
}

/**
 * Retrieve refresh token from secure storage
 */
export async function getStoredRefreshToken(): Promise<string | null> {
  if (shouldUseSecureStore()) {
    try {
      const val = (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) || (await SecureStore.getItemAsync(LEGACY_REFRESH_TOKEN_KEY));
      if (val) return val;
    } catch (err) {
      console.warn('SecureStore getStoredRefreshToken failed:', err);
    }
  }
  return getWebOrMemoryItem(REFRESH_TOKEN_KEY) || getWebOrMemoryItem(LEGACY_REFRESH_TOKEN_KEY);
}

/**
 * Update access token (and optionally refresh token) after token renewal in secure storage
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

  setWebOrMemoryItem(ACCESS_TOKEN_KEY, newAccessToken);
  if (newRefreshToken) {
    setWebOrMemoryItem(REFRESH_TOKEN_KEY, newRefreshToken);
  }
}

/**
 * Clear stored authentication session on sign out from secure storage
 */
export async function clearAuthSession(): Promise<void> {
  if (shouldUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(LEGACY_ACCESS_TOKEN_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(LEGACY_REFRESH_TOKEN_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(USER_SESSION_KEY);
      await SecureStore.deleteItemAsync(LEGACY_USER_SESSION_KEY).catch(() => {});
    } catch (err) {
      console.warn('SecureStore clear failed:', err);
    }
  }

  removeWebOrMemoryItem(ACCESS_TOKEN_KEY);
  removeWebOrMemoryItem(LEGACY_ACCESS_TOKEN_KEY);
  removeWebOrMemoryItem(REFRESH_TOKEN_KEY);
  removeWebOrMemoryItem(LEGACY_REFRESH_TOKEN_KEY);
  removeWebOrMemoryItem(USER_SESSION_KEY);
  removeWebOrMemoryItem(LEGACY_USER_SESSION_KEY);
}
