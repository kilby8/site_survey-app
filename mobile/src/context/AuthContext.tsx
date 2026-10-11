import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchCurrentUser,
  logout as apiLogout,
  exchangeSolarProSso,
  refreshAccessToken,
  HttpError,
  type AuthUser,
} from '../api/client';
import {
  clearSession,
  getAccessToken,
  getCachedUser,
  getRefreshToken,
  isTerminalRefreshError,
  onSessionChange,
  refreshOnce,
  saveCachedUser,
  saveTokens,
} from '../api/session';

// Refresh the access token this long before it expires.
const REFRESH_BUFFER_MS = 2 * 60 * 1000;
const REFRESH_RETRY_DELAY_MS = 60 * 1000;

/** exp claim (ms) from a JWT, without verifying it. */
function getTokenExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const decoded = JSON.parse(json) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  /** True while we show a cached user that hasn't been re-checked with the server yet. */
  offlineSession: boolean;
  signInWithSolarProToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineSession, setOfflineSession] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  };

  const endSession = useCallback(async () => {
    clearTimer();
    await clearSession();
    setToken(null);
    setUser(null);
    setOfflineSession(false);
  }, []);

  /** Refresh shortly before the access token expires; transient failures retry. */
  const scheduleRefresh = useCallback((accessToken: string) => {
    clearTimer();
    const expMs = getTokenExpMs(accessToken);
    if (!expMs) return;
    const delay = Math.max(0, expMs - Date.now() - REFRESH_BUFFER_MS);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const next = await refreshOnce(refreshAccessToken);
        setToken(next);
        scheduleRefresh(next);
      } catch (error) {
        if (isTerminalRefreshError(error)) {
          await endSession();
          return;
        }
        refreshTimerRef.current = setTimeout(() => scheduleRefresh(accessToken), REFRESH_RETRY_DELAY_MS);
      }
    }, delay);
  }, [endSession]);

  // Follow token changes made by the API layer (e.g. a 401 refresh during sync).
  useEffect(() => onSessionChange(() => {
    void (async () => {
      const current = await getAccessToken();
      setToken(current);
      if (!current) {
        clearTimer();
        setUser(null);
      } else {
        scheduleRefresh(current);
      }
    })();
  }), [scheduleRefresh]);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const [savedToken, cached] = await Promise.all([getAccessToken(), getCachedUser()]);
      if (!savedToken) {
        if (mounted) setLoading(false);
        return;
      }

      // Open straight away with the cached user so the app works offline and
      // during a server cold start; confirm with the server in the background.
      if (cached && mounted) {
        setToken(savedToken);
        setUser(cached);
        setOfflineSession(true);
        setLoading(false);
      }

      try {
        let active = savedToken;
        let current: AuthUser;
        try {
          current = await fetchCurrentUser(active);
        } catch (error) {
          if (!(error instanceof HttpError && error.status === 401)) throw error;
          active = await refreshOnce(refreshAccessToken);
          current = await fetchCurrentUser(active);
        }
        if (!mounted) return;
        await saveCachedUser(current);
        setToken(active);
        setUser(current);
        setOfflineSession(false);
        scheduleRefresh(active);
      } catch (error) {
        if (isTerminalRefreshError(error)) {
          await endSession();
        } else if (mounted && cached) {
          // Offline or server waking up: keep working with the cached user.
          scheduleRefresh(savedToken);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void restoreSession();
    return () => {
      mounted = false;
      clearTimer();
    };
  }, [endSession, scheduleRefresh]);

  const signInWithSolarProToken = useCallback(async (ssoToken: string) => {
    const result = await exchangeSolarProSso(ssoToken);
    await saveTokens(result.token, result.refreshToken);
    await saveCachedUser(result.user);
    setToken(result.token);
    setUser(result.user);
    setOfflineSession(false);
    if (result.refreshToken) scheduleRefresh(result.token);
  }, [scheduleRefresh]);

  const signOut = useCallback(async () => {
    const refresh = await getRefreshToken();
    await apiLogout(refresh);
    await endSession();
  }, [endSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, offlineSession, signInWithSolarProToken, signOut }),
    [user, token, loading, offlineSession, signInWithSolarProToken, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
