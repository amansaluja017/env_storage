import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { register } from 'node:module';

// Register ESM mock loader for react-native and expo-secure-store
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'react-native') {
      return {
        url: 'data:text/javascript,export const Platform = { OS: "ios" };',
        format: 'module',
        shortCircuit: true,
      };
    }
    if (specifier === 'expo-secure-store') {
      return {
        url: 'data:text/javascript,' + encodeURIComponent(\`
          export const getItemAsync = async (k) => globalThis.__mockStore?.get(k) ?? null;
          export const setItemAsync = async (k, v) => { globalThis.__mockStore?.set(k, v); };
          export const deleteItemAsync = async (k) => {
            globalThis.__mockStore?.deleteCalls.push(k);
            if (globalThis.__mockStore?.failKeys?.includes(k)) {
              throw new Error('SecureStore simulated failure for ' + k);
            }
            globalThis.__mockStore?.delete(k);
          };
        \`),
        format: 'module',
        shortCircuit: true,
      };
    }
    if (specifier === '../secureStorage') {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  }
`));

interface MockStoreState {
  data: Map<string, string>;
  get: (k: string) => string | null;
  set: (k: string, v: string) => void;
  delete: (k: string) => void;
  deleteCalls: string[];
  failKeys: string[];
  reset: () => void;
}

declare global {
  var __mockStore: MockStoreState | undefined;
}

const storeMap = new Map<string, string>();
const mockStoreState: MockStoreState = {
  data: storeMap,
  get: (k: string) => storeMap.get(k) ?? null,
  set: (k: string, v: string) => {
    storeMap.set(k, v);
  },
  delete: (k: string) => {
    storeMap.delete(k);
  },
  deleteCalls: [],
  failKeys: [],
  reset: () => {
    storeMap.clear();
    mockStoreState.deleteCalls = [];
    mockStoreState.failKeys = [];
  },
};

globalThis.__mockStore = mockStoreState;

describe('secureStorage', async () => {
  const {
    getAuthSession,
    saveAuthSession,
    clearAuthSession,
  } = await import('../secureStorage');

  beforeEach(() => {
    mockStoreState.reset();
  });

  describe('getAuthSession', () => {
    test('retrieves current generation session when all 3 keys are present', async () => {
      mockStoreState.set('env_auth_access_token', 'cur_access_123');
      mockStoreState.set('env_auth_refresh_token', 'cur_refresh_456');
      mockStoreState.set(
        'env_auth_user_session',
        JSON.stringify({ id: 'u_1', email: 'user@example.com', name: 'User' })
      );

      const session = await getAuthSession();
      assert.ok(session !== null);
      assert.strictEqual(session.accessToken, 'cur_access_123');
      assert.strictEqual(session.refreshToken, 'cur_refresh_456');
      assert.strictEqual(session.user.id, 'u_1');
    });

    test('falls back to legacy generation session when current keys are absent', async () => {
      mockStoreState.set('tubo_auth_access_token', 'leg_access_abc');
      mockStoreState.set('tubo_auth_refresh_token', 'leg_refresh_def');
      mockStoreState.set(
        'tubo_auth_user_session',
        JSON.stringify({ id: 'u_leg', email: 'legacy@example.com', name: 'Legacy User' })
      );

      const session = await getAuthSession();
      assert.ok(session !== null);
      assert.strictEqual(session.accessToken, 'leg_access_abc');
      assert.strictEqual(session.refreshToken, 'leg_refresh_def');
      assert.strictEqual(session.user.email, 'legacy@example.com');
    });

    test('does not mix current tokens with legacy tokens if current is partial', async () => {
      mockStoreState.set('env_auth_access_token', 'cur_access_123');
      mockStoreState.set('tubo_auth_refresh_token', 'leg_refresh_def');
      mockStoreState.set(
        'tubo_auth_user_session',
        JSON.stringify({ id: 'u_leg', email: 'legacy@example.com', name: 'Legacy User' })
      );

      // Neither tuple is complete, so should return null (never mix cur_access with leg_refresh)
      const session = await getAuthSession();
      assert.strictEqual(session, null);
    });

    test('returns null when storage is completely empty', async () => {
      const session = await getAuthSession();
      assert.strictEqual(session, null);
    });
  });

  describe('clearAuthSession', () => {
    test('attempts deletion of all 6 keys in SecureStore', async () => {
      await clearAuthSession();

      const expectedKeys = [
        'env_auth_access_token',
        'tubo_auth_access_token',
        'env_auth_refresh_token',
        'tubo_auth_refresh_token',
        'env_auth_user_session',
        'tubo_auth_user_session',
      ];

      assert.strictEqual(mockStoreState.deleteCalls.length, 6);
      for (const key of expectedKeys) {
        assert.ok(
          mockStoreState.deleteCalls.includes(key),
          `Expected deletion call for key: ${key}`
        );
      }
    });

    test('attempts all remaining keys even when initial key deletion fails, and propagates error', async () => {
      // Simulate failure on the very first key
      mockStoreState.failKeys = ['env_auth_access_token'];

      let threw = false;
      let thrownError: any = null;
      try {
        await clearAuthSession();
      } catch (err: any) {
        threw = true;
        thrownError = err;
      }

      assert.strictEqual(threw, true);
      assert.ok(thrownError?.message.includes('SecureStore simulated failure for env_auth_access_token'));

      // All 6 keys must have been attempted despite the rejection on the first key
      assert.strictEqual(mockStoreState.deleteCalls.length, 6);
    });
  });
});
