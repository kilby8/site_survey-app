// ============================================================
// Session storage and the one shared token refresh.
//
// Tokens live in SecureStore (Keystore / Keychain). The signed-in user
// is cached in AsyncStorage so the app opens offline. Every refresh in
// the app goes through refreshOnce(), so two callers can never spend
// the same refresh token (the server treats reuse as theft and signs
// the user out everywhere).
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "site-survey.auth.access";
const REFRESH_KEY = "site-survey.auth.refresh";
const USER_KEY = "site-survey.auth.user.v1";
// Where earlier builds kept the tokens (plain AsyncStorage).
const LEGACY_ACCESS_KEY = "site-survey.auth.token.v2";
const LEGACY_REFRESH_KEY = "site-survey.auth.refresh-token.v1";

export interface CachedUser {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "user";
  createdAt: string;
  username?: string;
}

let memAccess: string | null | undefined;
let memRefresh: string | null | undefined;
let migrated = false;

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string | null): Promise<void> {
  try {
    if (value) await SecureStore.setItemAsync(key, value);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // keep the in-memory copy; next launch will ask to sign in again
  }
}

/** Move tokens from AsyncStorage (old builds) into SecureStore once. */
async function migrateLegacy(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    const [access, refresh] = await Promise.all([
      AsyncStorage.getItem(LEGACY_ACCESS_KEY),
      AsyncStorage.getItem(LEGACY_REFRESH_KEY),
    ]);
    if (access && !(await secureGet(ACCESS_KEY))) await secureSet(ACCESS_KEY, access);
    if (refresh && !(await secureGet(REFRESH_KEY))) await secureSet(REFRESH_KEY, refresh);
    await AsyncStorage.multiRemove([LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY]);
  } catch {
    // nothing to migrate
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (memAccess !== undefined) return memAccess;
  await migrateLegacy();
  memAccess = await secureGet(ACCESS_KEY);
  return memAccess;
}

export async function getRefreshToken(): Promise<string | null> {
  if (memRefresh !== undefined) return memRefresh;
  await migrateLegacy();
  memRefresh = await secureGet(REFRESH_KEY);
  return memRefresh;
}

export async function saveTokens(access: string, refresh: string | null): Promise<void> {
  memAccess = access;
  memRefresh = refresh;
  await secureSet(ACCESS_KEY, access);
  await secureSet(REFRESH_KEY, refresh);
  notify();
}

export async function getCachedUser(): Promise<CachedUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as CachedUser) : null;
  } catch {
    return null;
  }
}

export async function saveCachedUser(user: CachedUser): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // offline start will need a sign-in
  }
}

export async function clearSession(): Promise<void> {
  memAccess = null;
  memRefresh = null;
  await secureSet(ACCESS_KEY, null);
  await secureSet(REFRESH_KEY, null);
  try {
    await AsyncStorage.multiRemove([USER_KEY, LEGACY_ACCESS_KEY, LEGACY_REFRESH_KEY]);
  } catch {
    // ignore
  }
  notify();
}

// ── change listeners (AuthContext follows token changes made by the API layer) ──

type Listener = () => void;
const listeners = new Set<Listener>();
export function onSessionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

// ── single-flight refresh ──────────────────────────────────────

export class SessionExpiredError extends Error {
  constructor() {
    super("Your sign-in expired. Sign in again to keep uploading.");
    this.name = "SessionExpiredError";
  }
}

export function isTerminalRefreshError(error: unknown): boolean {
  if (error instanceof SessionExpiredError) return true;
  if (!(error instanceof Error)) return false;
  const m = error.message.toLowerCase();
  return (
    m.includes("http 401") ||
    m.includes("http 403") ||
    m.includes("invalid refresh token") ||
    m.includes("expired or revoked") ||
    m.includes("refresh token is required")
  );
}

let inflight: Promise<string> | null = null;

/**
 * Refresh the access token. Concurrent callers share one request.
 * `exchange` performs the HTTP call (injected to avoid an import cycle).
 * Throws SessionExpiredError when the refresh token is no longer valid.
 */
export function refreshOnce(
  exchange: (refreshToken: string) => Promise<{ token: string; refreshToken: string }>,
): Promise<string> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const refresh = await getRefreshToken();
      if (!refresh) throw new SessionExpiredError();
      try {
        const next = await exchange(refresh);
        await saveTokens(next.token, next.refreshToken);
        return next.token;
      } catch (error) {
        if (isTerminalRefreshError(error)) {
          await clearSession();
          throw new SessionExpiredError();
        }
        throw error;
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test hook: forget in-memory state. */
export function __resetSessionForTests(): void {
  memAccess = undefined;
  memRefresh = undefined;
  migrated = false;
  inflight = null;
  listeners.clear();
}
