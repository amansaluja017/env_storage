import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  getAuthSession,
  updateAccessToken,
  clearAuthSession,
} from '../storage/secureStorage';
import { encodeProto, decodeProto } from '@tubo/proto';

let activeAccessToken: string | null = null;
let activeRefreshToken: string | null = null;
let activeApiBaseUrl: string = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

type SessionExpiredHandler = () => void;
type TokenUpdatedHandler = (newAccessToken: string) => void;

let sessionExpiredCallback: SessionExpiredHandler | null = null;
let tokenUpdatedCallback: TokenUpdatedHandler | null = null;

export function registerAuthCallbacks(callbacks: {
  onSessionExpired?: SessionExpiredHandler;
  onTokenUpdated?: TokenUpdatedHandler;
}) {
  if (callbacks.onSessionExpired) {
    sessionExpiredCallback = callbacks.onSessionExpired;
  }
  if (callbacks.onTokenUpdated) {
    tokenUpdatedCallback = callbacks.onTokenUpdated;
  }
}

export function setApiBaseUrl(url: string) {
  if (!url) {
    throw new Error('API base URL must not be empty');
  }
  activeApiBaseUrl = url.replace(/\/+$/, '');
  apiClient.defaults.baseURL = activeApiBaseUrl;
}

export function setActiveTokens(tokens: { accessToken: string | null; refreshToken?: string | null }) {
  activeAccessToken = tokens.accessToken;
  if (tokens.refreshToken !== undefined) {
    activeRefreshToken = tokens.refreshToken;
  }
}

export function getActiveAccessToken(): string | null {
  return activeAccessToken;
}

export function getActiveRefreshToken(): string | null {
  return activeRefreshToken;
}

/**
 * Renew tokens by calling /trpc/auth.refreshToken with the current refresh token.
 * Prevents multiple simultaneous refresh calls by sharing the ongoing promise.
 */
export function renewAuthTokens(apiBaseUrl?: string): Promise<string | null> {
  const targetBaseUrl = (apiBaseUrl || activeApiBaseUrl || process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');

  if (refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      // Load refresh token from state or storage if missing in memory
      if (!activeRefreshToken) {
        const saved = await getAuthSession();
        if (saved?.refreshToken) {
          activeRefreshToken = saved.refreshToken;
          activeAccessToken = saved.accessToken;
        }
      }

      if (!activeRefreshToken) {
        if (sessionExpiredCallback) sessionExpiredCallback();
        return null;
      }

      console.log('🔄 Access token expired. Renewing auth tokens from API via Axios...');
      const response = await axios.post(`${targetBaseUrl}/trpc/auth.refreshToken`, {
        refreshToken: activeRefreshToken,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      const data = response.data;

      if (data.error) {
        console.warn('❌ Refresh token failed:', data.error?.message);
        await clearAuthSession();
        activeAccessToken = null;
        activeRefreshToken = null;
        if (sessionExpiredCallback) sessionExpiredCallback();
        return null;
      }

      const result = data.result?.data;
      if (result?.accessToken) {
        const newAccess = result.accessToken;
        const newRefresh = result.refreshToken || activeRefreshToken;

        activeAccessToken = newAccess;
        activeRefreshToken = newRefresh;

        // Persist new tokens to storage
        await updateAccessToken(newAccess, newRefresh);

        if (tokenUpdatedCallback) {
          tokenUpdatedCallback(newAccess);
        }

        console.log('✔ Auth tokens successfully renewed via Axios!');
        return newAccess;
      }

      return null;
    } catch (err: any) {
      const status = err.response?.status;
      const errorMessage = err.response?.data?.error?.message;
      console.warn('Network error while renewing tokens via Axios:', errorMessage || err?.message || err);

      // If server rejected the refresh token (401 Unauthorized / 400 Bad Request / 403)
      if (status === 401 || status === 403 || status === 400 || errorMessage === 'UNAUTHORIZED') {
        console.warn('❌ Refresh token rejected by server, signing out...');
        await clearAuthSession();
        activeAccessToken = null;
        activeRefreshToken = null;
        if (sessionExpiredCallback) sessionExpiredCallback();
      }
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

type NetworkLoadingListener = (isLoading: boolean, activeRequests: number) => void;
let activeRequestCount = 0;
const networkLoadingListeners = new Set<NetworkLoadingListener>();

function notifyNetworkLoading() {
  const isLoading = activeRequestCount > 0;
  for (const listener of networkLoadingListeners) {
    try {
      listener(isLoading, activeRequestCount);
    } catch (e) {
      console.warn('Network loading listener error:', e);
    }
  }
}

export function subscribeNetworkLoading(listener: NetworkLoadingListener): () => void {
  networkLoadingListeners.add(listener);
  listener(activeRequestCount > 0, activeRequestCount);
  return () => {
    networkLoadingListeners.delete(listener);
  };
}

/**
 * Main Axios Instance for App API calls with automatic Bearer token and refresh interceptors
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: activeApiBaseUrl || undefined,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 1. Request Interceptor: Attach Access Token & Track Server Request Loading
apiClient.interceptors.request.use(
  async (config) => {
    activeRequestCount++;
    notifyNetworkLoading();

    // If token not already attached, attach activeAccessToken
    if (!config.headers.Authorization && activeAccessToken) {
      config.headers.Authorization = `Bearer ${activeAccessToken}`;
    }
    return config;
  },
  (error) => {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    notifyNetworkLoading();
    return Promise.reject(error);
  }
);

// 2. Response Interceptor: Handle 401 & Auto-Renew Token & Track Server Request Loading
apiClient.interceptors.response.use(
  (response) => {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    notifyNetworkLoading();
    return response;
  },
  async (error) => {
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    notifyNetworkLoading();

    const originalRequest = error.config;

    // Check for 401 Unauthorized or TOKEN_EXPIRED error
    const is401 = error.response?.status === 401;
    const isTokenExpired = error.response?.data?.error?.message === 'TOKEN_EXPIRED';

    if (originalRequest && (is401 || isTokenExpired) && !originalRequest._retry) {
      originalRequest._retry = true;

      const newAccessToken = await renewAuthTokens(activeApiBaseUrl);
      if (newAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Convenient API Helper Functions
 */
export async function apiGet<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.get<T>(url, config);
  return response.data;
}

export async function apiPost<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.post<T>(url, data, config);
  return response.data;
}

export async function apiPut<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.put<T>(url, data, config);
  return response.data;
}

export async function apiDelete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.delete<T>(url, config);
  return response.data;
}

/**
 * Perform a binary Protocol Buffers API request over the internet
 */
export async function protoRequest<TReq, TRes>(
  url: string,
  reqPayload: TReq,
  reqType: any,
  resType: any,
  config?: AxiosRequestConfig
): Promise<TRes> {
  const encodedBytes = encodeProto(reqType, reqPayload);

  const response = await apiClient.post(url, encodedBytes, {
    ...config,
    headers: {
      ...config?.headers,
      'Content-Type': 'application/x-protobuf',
      Accept: 'application/x-protobuf',
    },
    responseType: 'arraybuffer',
  });

  return decodeProto<TRes>(resType, response.data);
}

/**
 * Backwards-compatible fetch-like wrapper powered by Axios
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  apiBaseUrl?: string
): Promise<{ ok: boolean; status: number; json: () => Promise<any> }> {
  if (apiBaseUrl) {
    setApiBaseUrl(apiBaseUrl);
  }

  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {};

  if (options.headers) {
    if (typeof options.headers === 'object' && !('forEach' in options.headers)) {
      Object.assign(headers, options.headers);
    } else if ('forEach' in options.headers) {
      (options.headers as Headers).forEach((value, key) => {
        headers[key] = value;
      });
    }
  }

  let requestData: any = undefined;
  if (options.body && typeof options.body === 'string') {
    try {
      requestData = JSON.parse(options.body);
    } catch {
      requestData = options.body;
    }
  }

  try {
    const res = await apiClient.request({
      url,
      method: method as any,
      headers,
      data: requestData,
    });

    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.data,
    };
  } catch (err: any) {
    if (err.response) {
      return {
        ok: false,
        status: err.response.status,
        json: async () => err.response.data,
      };
    }
    throw err;
  }
}
