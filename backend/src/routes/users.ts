import { createHash, randomBytes } from 'crypto';
import { Router, Request, Response } from 'express';
import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import {
  getUserById,
  getUserByEmail,
  createUser,
  verifyUserCredentials,
  updateUserPasswordByEmail,
  insertRefreshToken,
  getRefreshTokenWithUserByHash,
  revokeRefreshTokenById,
  revokeRefreshTokensByUserId,
  revokeRefreshTokenByHash,
  deleteRefreshTokensByUserId,
  deleteUserById,
  listUsersWithHashMetadata,
} from '../services/sqliteAuthStore';
import {
  signAuthToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from '../utils/authToken';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { authAudit } from '../utils/authAudit';
import { sendPasswordResetEmail } from '../utils/passwordResetMailer';
import { pool } from '../database';

const router = Router();

const ADMIN_EMAIL_OVERRIDES = new Set(['carpenterjames88@gmail.com', 'carpj88@outlook.com']);

interface AuthBody {
  identifier?: string;
  email?: string;
  password?: string;
  full_name?: string;
  token?: string;
  new_password?: string;
}

interface SignInAttemptState {
  failures: number;
  firstFailureAt: number;
  lockedUntil?: number;
}

interface PasswordResetState {
  tokenHash: string;
  expiresAt: number;
}

let authStateTablesReady: Promise<void> | null = null;
let solarProSsoTokensReady: Promise<void> | null = null;

function getIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SIGNIN_MAX_FAILURES = getIntEnv('SIGNIN_MAX_FAILURES', 5);
const SIGNIN_WINDOW_MS = getIntEnv('SIGNIN_WINDOW_MINUTES', 15) * 60 * 1000;
const SIGNIN_LOCK_MS = getIntEnv('SIGNIN_LOCK_MINUTES', 15) * 60 * 1000;
const REGISTER_MAX_REQUESTS = getIntEnv('USERS_REGISTER_MAX_REQUESTS', 8);
const REGISTER_WINDOW_MS = getIntEnv('USERS_REGISTER_WINDOW_MINUTES', 15) * 60 * 1000;
const ME_MAX_REQUESTS = getIntEnv('USERS_ME_MAX_REQUESTS', 120);
const ME_WINDOW_MS = getIntEnv('USERS_ME_WINDOW_MINUTES', 1) * 60 * 1000;
const PASSWORD_RESET_TTL_MS = getIntEnv('PASSWORD_RESET_TTL_MINUTES', 30) * 60 * 1000;
const PASSWORD_RESET_EXPOSE_TOKEN = process.env.PASSWORD_RESET_EXPOSE_TOKEN === 'true';
const SUPPORTED_SOCIAL_PROVIDERS = new Set(['google', 'microsoft', 'apple']);

function ensureAuthStateTables(): Promise<void> {
  if (!authStateTablesReady) {
    authStateTablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS signin_attempts (
          attempt_key TEXT PRIMARY KEY,
          failures INT NOT NULL DEFAULT 0,
          first_failure_at TIMESTAMPTZ NOT NULL,
          locked_until TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          email TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query('CREATE INDEX IF NOT EXISTS signin_attempts_locked_until_idx ON signin_attempts(locked_until)');
      await pool.query('CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx ON password_reset_tokens(expires_at)');
    })().catch((error) => {
      authStateTablesReady = null;
      throw error;
    });
  }

  return authStateTablesReady;
}

function ensureSolarProSsoTokensTable(): Promise<void> {
  if (!solarProSsoTokensReady) {
    solarProSsoTokensReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS used_solarpro_sso_tokens (
          jti TEXT PRIMARY KEY,
          used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        solarProSsoTokensReady = null;
        throw error;
      });
  }

  return solarProSsoTokensReady;
}

function getAdminPassword(): string {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_PASSWORD environment variable must be set in production');
  }
  return 'admin123!';
}

const ADMIN_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  username: process.env.ADMIN_USERNAME || 'admin',
  email: process.env.ADMIN_EMAIL || 'admin@site-survey.local',
  fullName: process.env.ADMIN_FULL_NAME || 'Administrator',
  password: getAdminPassword(),
  role: 'admin' as const,
};

function isElevatedAdminEmail(email: string): boolean {
  const normalized = cleanEmail(email);
  return normalized === cleanEmail(ADMIN_USER.email) || ADMIN_EMAIL_OVERRIDES.has(normalized);
}

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function attemptKey(req: Request, email: string): string {
  return `${getClientIp(req)}:${email}`;
}

async function getSignInState(key: string): Promise<SignInAttemptState> {
  await ensureAuthStateTables();
  const now = Date.now();

  const { rows } = await pool.query<{
    failures: number;
    first_failure_at: string;
    locked_until: string | null;
  }>(
    `SELECT failures, first_failure_at::text, locked_until::text
       FROM signin_attempts
      WHERE attempt_key = $1
      LIMIT 1`,
    [key],
  );

  const row = rows[0];

  if (!row) {
    await pool.query(
      `INSERT INTO signin_attempts (attempt_key, failures, first_failure_at, locked_until, updated_at)
       VALUES ($1, 0, NOW(), NULL, NOW())
       ON CONFLICT (attempt_key) DO NOTHING`,
      [key],
    );
    return { failures: 0, firstFailureAt: now };
  }

  const firstFailureAt = new Date(row.first_failure_at).getTime();
  const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : undefined;
  const existing: SignInAttemptState = {
    failures: Number(row.failures) || 0,
    firstFailureAt,
    lockedUntil,
  };

  if (existing.firstFailureAt + SIGNIN_WINDOW_MS < now) {
    const reset: SignInAttemptState = { failures: 0, firstFailureAt: now };
    await pool.query(
      `UPDATE signin_attempts
          SET failures = 0,
              first_failure_at = NOW(),
              locked_until = NULL,
              updated_at = NOW()
        WHERE attempt_key = $1`,
      [key],
    );
    return reset;
  }

  return existing;
}

function isSignInLocked(state: SignInAttemptState): boolean {
  return typeof state.lockedUntil === 'number' && state.lockedUntil > Date.now();
}

async function recordSignInFailure(key: string, state: SignInAttemptState): Promise<void> {
  await ensureAuthStateTables();
  state.failures += 1;
  if (state.failures >= SIGNIN_MAX_FAILURES) {
    state.lockedUntil = Date.now() + SIGNIN_LOCK_MS;
  }

  await pool.query(
    `INSERT INTO signin_attempts (attempt_key, failures, first_failure_at, locked_until, updated_at)
     VALUES ($1, $2, to_timestamp($3 / 1000.0), $4, NOW())
     ON CONFLICT (attempt_key)
     DO UPDATE SET
       failures = EXCLUDED.failures,
       first_failure_at = EXCLUDED.first_failure_at,
       locked_until = EXCLUDED.locked_until,
       updated_at = NOW()`,
    [
      key,
      state.failures,
      state.firstFailureAt,
      state.lockedUntil ? new Date(state.lockedUntil).toISOString() : null,
    ],
  );
}

async function clearSignInFailures(key: string): Promise<void> {
  await ensureAuthStateTables();
  await pool.query('DELETE FROM signin_attempts WHERE attempt_key = $1', [key]);
}

const registerRateLimit = createRateLimiter({
  maxRequests: REGISTER_MAX_REQUESTS,
  windowMs: REGISTER_WINDOW_MS,
  keyFn: (req) => {
    const body = req.body as AuthBody;
    return `register:${getClientIp(req)}:${cleanEmail(body.email)}`;
  },
  message: 'Too many registration attempts. Please try again later.',
});

const meRateLimit = createRateLimiter({
  maxRequests: ME_MAX_REQUESTS,
  windowMs: ME_WINDOW_MS,
  keyFn: (req) => `me:${getClientIp(req)}:${req.authUser?.userId || 'anonymous'}`,
  message: 'Too many profile requests. Please try again later.'
});

function cleanEmail(email?: string): string {
  return (email || '').trim().toLowerCase();
}

function cleanIdentifier(identifier?: string): string {
  return (identifier || '').trim().toLowerCase();
}

function isAdminIdentifier(identifier: string): boolean {
  return identifier === ADMIN_USER.username || identifier === ADMIN_USER.email;
}

function buildAdminUser() {
  return {
    id: ADMIN_USER.id,
    username: ADMIN_USER.username,
    email: ADMIN_USER.email,
    fullName: ADMIN_USER.fullName,
    role: ADMIN_USER.role,
    createdAt: new Date(0).toISOString(),
  };
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createPasswordResetToken(email: string): Promise<string> {
  await ensureAuthStateTables();
  const token = randomBytes(24).toString('hex');
  const expiresAtIso = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

  await pool.query(
    `INSERT INTO password_reset_tokens (email, token_hash, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3::timestamptz, NOW(), NOW())
     ON CONFLICT (email)
     DO UPDATE SET
       token_hash = EXCLUDED.token_hash,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [email, hashResetToken(token), expiresAtIso],
  );

  return token;
}

function normalizeResetToken(token?: string): string {
  return (token || '').trim().replace(/^token[:=]/i, '').trim();
}

async function isValidResetToken(email: string, token: string): Promise<boolean> {
  await ensureAuthStateTables();
  const normalizedToken = normalizeResetToken(token);
  if (!normalizedToken) return false;

  const { rows } = await pool.query<PasswordResetState & { expires_at: string }>(
    `SELECT token_hash AS "tokenHash", expires_at::text AS expires_at
       FROM password_reset_tokens
      WHERE email = $1
      LIMIT 1`,
    [email],
  );

  const row = rows[0];
  const resetState = row
    ? {
        tokenHash: row.tokenHash,
        expiresAt: new Date(row.expires_at).getTime(),
      }
    : null;

  if (!resetState) return false;
  if (resetState.expiresAt <= Date.now()) {
    await pool.query('DELETE FROM password_reset_tokens WHERE email = $1', [email]);
    return false;
  }

  return resetState.tokenHash === hashResetToken(normalizedToken);
}

/** Issues a new refresh token, persists its hash, and returns the raw value. */
async function issueRefreshToken(userId: string, email: string, fullName: string): Promise<string> {
  const raw = generateRefreshToken();
  const hash = hashRefreshToken(raw);
  const expiresAt = refreshTokenExpiresAt();
  await insertRefreshToken(userId, email, fullName, hash, expiresAt);
  return raw;
}

/** Revokes all active refresh tokens for a user — called on fresh sign-in to invalidate prior sessions. */
async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
      [userId],
    );
  } catch (err) {
    console.warn('revokeAllUserRefreshTokens: non-fatal error', err);
  }
}


// GET /api/users/active-sessions (admin only)
router.get('/active-sessions', requireAuth, async (req: Request, res: Response) => {
  const isAdmin = req.authUser?.role === 'admin' || isElevatedAdminEmail(req.authUser?.email || '');
  if (!isAdmin) { res.status(403).json({ error: 'Admin access required' }); return; }
  try {
    const { rows } = await pool.query(
      'SELECT user_id, email, full_name, created_at, expires_at FROM refresh_tokens WHERE revoked = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ activeSessions: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});
// GET /api/users/me
router.get('/me', requireAuth, meRateLimit, async (req: Request, res: Response) => {
  try {
    if (req.authUser?.userId === ADMIN_USER.id) {
      authAudit('users.me.success', req, ADMIN_USER.email, { status: 200, userId: ADMIN_USER.id });
      res.json({ user: buildAdminUser() });
      return;
    }

    const userId = req.authUser?.userId;
    if (!userId) {
      authAudit('users.me.unauthorized', req, req.authUser?.email, { status: 401, reason: 'missing-auth-user' });
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await getUserById(userId);

    if (!user) {
      authAudit('users.me.not_found', req, req.authUser?.email, { status: 404, userId });
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isAdmin = req.authUser?.role === 'admin' || isElevatedAdminEmail(user.email);

    authAudit('users.me.success', req, user.email, { status: 200, userId });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: isAdmin ? 'admin' : 'user',
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    authAudit('users.me.error', req, req.authUser?.email, { status: 500 });
    res.status(500).json({ error: 'Failed to fetch current user' });
  }
});

// POST /api/users/register
router.post('/register', registerRateLimit, async (req: Request, res: Response) => {
  const { email, password, full_name } = req.body as AuthBody;
  const normalizedEmail = cleanEmail(email);
  const displayName = (full_name || '').trim();

  authAudit('users.register.attempt', req, normalizedEmail);

  if (!normalizedEmail || !password || !displayName) {
    authAudit('users.register.reject', req, normalizedEmail, { status: 400, reason: 'missing-fields' });
    res.status(400).json({ error: 'Email, password, and full name are required' });
    return;
  }

  if (password.length < 8) {
    authAudit('users.register.reject', req, normalizedEmail, { status: 400, reason: 'password-too-short' });
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const existing = await getUserByEmail(normalizedEmail);
    if (existing) {
      authAudit('users.register.conflict', req, normalizedEmail, { status: 409, reason: 'email-exists' });
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const user = await createUser(normalizedEmail, password, displayName);
    const token = signAuthToken({ userId: user.id, email: user.email });
    const refreshToken = await issueRefreshToken(user.id, user.email, user.full_name);
    authAudit('users.register.success', req, user.email, { status: 201, userId: user.id });

    res.status(201).json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: 'user',
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('POST /api/users/register error:', err);
    authAudit('users.register.error', req, normalizedEmail, { status: 500 });
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/users/signin
router.post('/signin', async (req: Request, res: Response) => {
  const { identifier, email, password } = req.body as AuthBody;
  const normalizedIdentifier = cleanIdentifier(identifier || email);

  authAudit('users.signin.attempt', req, normalizedIdentifier);

  if (!normalizedIdentifier || !password) {
    authAudit('users.signin.reject', req, normalizedIdentifier, { status: 400, reason: 'missing-fields' });
    res.status(400).json({ error: 'Email or username and password are required' });
    return;
  }

  try {
    const key = attemptKey(req, normalizedIdentifier);
    const state = await getSignInState(key);

    if (isSignInLocked(state)) {
      authAudit('users.signin.locked', req, normalizedIdentifier, { status: 429, reason: 'active-lockout' });
      res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
      return;
    }

    if (isAdminIdentifier(normalizedIdentifier) && password === ADMIN_USER.password) {
      await clearSignInFailures(key);
      await revokeAllUserRefreshTokens(ADMIN_USER.id);
      const token = signAuthToken({
        userId: ADMIN_USER.id,
        username: ADMIN_USER.username,
        email: ADMIN_USER.email,
        role: ADMIN_USER.role,
      });
      const refreshToken = await issueRefreshToken(
        ADMIN_USER.id,
        ADMIN_USER.email,
        ADMIN_USER.fullName,
      );
      authAudit('users.signin.success', req, ADMIN_USER.email, { status: 200, userId: ADMIN_USER.id });
      res.json({ token, refreshToken, user: buildAdminUser() });
      return;
    }

    const user = await verifyUserCredentials(normalizedIdentifier, password);

    if (!user) {
      await recordSignInFailure(key, state);
      if (isSignInLocked(state)) {
        authAudit('users.signin.locked', req, normalizedIdentifier, { status: 429, reason: 'lockout-threshold-reached' });
        res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
        return;
      }
      authAudit('users.signin.failure', req, normalizedIdentifier, { status: 401, reason: 'invalid-credentials' });
      res.status(401).json({ error: 'Invalid email, username, or password' });
      return;
    }

    await clearSignInFailures(key);
    await revokeAllUserRefreshTokens(user.id);
    const isAdmin = isElevatedAdminEmail(user.email);
    const token = signAuthToken({ userId: user.id, email: user.email, role: isAdmin ? 'admin' : 'user' });
    const refreshToken = await issueRefreshToken(user.id, user.email, user.full_name);
    authAudit('users.signin.success', req, user.email, { status: 200, userId: user.id });

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: isAdmin ? 'admin' : 'user',
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('POST /api/users/signin error:', err);
    authAudit('users.signin.error', req, normalizedIdentifier, { status: 500 });
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

// POST /api/users/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body as AuthBody;
  const normalizedEmail = cleanEmail(email);

  if (!normalizedEmail) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  authAudit('users.forgot-password.attempt', req, normalizedEmail);

  try {
    const genericMessage = 'If that email exists, password reset instructions have been sent.';

    const user = await getUserByEmail(normalizedEmail);
    if (user) {
      const resetToken = await createPasswordResetToken(normalizedEmail);
      let delivery: 'sent' | 'failed' = 'sent';

      try {
        await sendPasswordResetEmail(normalizedEmail, resetToken);
      } catch (mailErr) {
        delivery = 'failed';
        console.error('Password reset email delivery error:', mailErr);
      }

      const exposeResetToken =
        process.env.NODE_ENV !== 'production' ||
        delivery === 'failed' ||
        PASSWORD_RESET_EXPOSE_TOKEN;

      authAudit('users.forgot-password.success', req, normalizedEmail, { status: 200, userId: user.id });
      res.json({
        message: genericMessage,
        delivery,
        resetToken: exposeResetToken ? resetToken : undefined,
        expiresInMinutes: Math.floor(PASSWORD_RESET_TTL_MS / 60000),
      });
      return;
    }

    authAudit('users.forgot-password.success', req, normalizedEmail, { status: 200, reason: 'generic-response' });
    res.json({ message: genericMessage });
  } catch (err) {
    console.error('POST /api/users/forgot-password error:', err);
    authAudit('users.forgot-password.error', req, normalizedEmail, { status: 500 });
    res.status(500).json({ error: 'Failed to create password reset token' });
  }
});

// POST /api/users/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  const { email, token, new_password } = req.body as AuthBody;
  const normalizedEmail = cleanEmail(email);
  const normalizedToken = normalizeResetToken(token);
  const nextPassword = (new_password || '').trim();

  if (!normalizedEmail || !normalizedToken || !nextPassword) {
    res.status(400).json({ error: 'Email, token, and new password are required' });
    return;
  }

  if (nextPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  authAudit('users.reset-password.attempt', req, normalizedEmail);

  try {
    if (!(await isValidResetToken(normalizedEmail, normalizedToken))) {
      authAudit('users.reset-password.reject', req, normalizedEmail, { status: 400, reason: 'invalid-token' });
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const user = await updateUserPasswordByEmail(normalizedEmail, nextPassword);

    await pool.query('DELETE FROM password_reset_tokens WHERE email = $1', [normalizedEmail]);

    if (!user) {
      authAudit('users.reset-password.reject', req, normalizedEmail, { status: 404, reason: 'user-not-found' });
      res.status(404).json({ error: 'User not found' });
      return;
    }

    authAudit('users.reset-password.success', req, normalizedEmail, { status: 200, userId: user.id });
    res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
  } catch (err) {
    console.error('POST /api/users/reset-password error:', err);
    authAudit('users.reset-password.error', req, normalizedEmail, { status: 500 });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// POST /api/users/oauth/:provider
router.post('/oauth/:provider', (req: Request, res: Response) => {
  const provider = String(req.params.provider || '').toLowerCase();

  if (!SUPPORTED_SOCIAL_PROVIDERS.has(provider)) {
    res.status(400).json({ error: 'Unsupported social provider' });
    return;
  }

  authAudit('users.oauth.placeholder', req, provider, { status: 501, reason: `${provider}-not-configured` });
  res.status(501).json({ error: `${provider[0].toUpperCase()}${provider.slice(1)} sign-in is not configured yet.` });
});

// POST /api/users/refresh
// Validates a refresh token and issues a new access token + rotated refresh token.
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken || typeof refreshToken !== 'string') {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  try {
    const hash = hashRefreshToken(refreshToken);
    const row = await getRefreshTokenWithUserByHash(hash);

    if (!row) {
      authAudit('users.refresh.reject', req, undefined, { status: 401, reason: 'token-not-found' });
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    if (Boolean(row.revoked) || new Date(row.expires_at) <= new Date()) {
      await revokeRefreshTokensByUserId(row.user_id);
      authAudit('users.refresh.reject', req, row.email, { status: 401, reason: row.revoked ? 'revoked' : 'expired' });
      res.status(401).json({ error: 'Refresh token expired or revoked' });
      return;
    }

    await revokeRefreshTokenById(row.id);
    const isAdmin = isElevatedAdminEmail(row.email);
    const newAccessToken = signAuthToken({ userId: row.user_id, email: row.email, role: isAdmin ? 'admin' : 'user' });
    const newRefreshToken = await issueRefreshToken(row.user_id, row.email, row.full_name);

    authAudit('users.refresh.success', req, row.email, { status: 200, userId: row.user_id });
    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('POST /api/users/refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// POST /api/users/logout
// Revokes the supplied refresh token server-side.
router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken && typeof refreshToken === 'string') {
    try {
      const hash = hashRefreshToken(refreshToken);
      await revokeRefreshTokenByHash(hash);
    } catch (err) {
      console.error('POST /api/users/logout error:', err);
    }
  }

  res.json({ message: 'Logged out' });
});

// POST /api/users/solarpro-sso
// Accepts a SolarPro handoff JWT and returns local auth tokens,
// auto-provisioning a user account when needed.
router.post('/solarpro-sso', async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  const handoffSecret = process.env.SOLARPRO_HANDOFF_SECRET?.trim();
  if (!handoffSecret) {
    console.error('[solarpro-sso] SOLARPRO_HANDOFF_SECRET is not configured');
    res.status(500).json({ error: 'SSO not configured' });
    return;
  }

  let decoded: {
    solarpro_user_id?: string;
    solarpro_project_id?: string;
    solarpro_org_id?: string;
    solarpro_email?: string;
    solarpro_name?: string;
    email?: string;
    name?: string;
    project_id?: string;
    jti?: string;
    exp?: number;
  };

  try {
    const verified = jwt.verify(token, handoffSecret, { algorithms: ['HS256'] });
    if (!verified || typeof verified !== 'object') {
      res.status(401).json({ error: 'Invalid SSO token' });
      return;
    }
    decoded = verified as typeof decoded;
  } catch (verifyErr) {
    if (verifyErr instanceof TokenExpiredError) {
      res.status(401).json({ error: 'SSO token expired. Please sign in again.' });
      return;
    }

    if (verifyErr instanceof JsonWebTokenError) {
      // Most common cause in this integration is handoff secret mismatch between SolarPro and app backend.
      if (/invalid signature/i.test(verifyErr.message)) {
        res.status(401).json({
          error:
            'Invalid SSO token signature. SolarPro handoff secret does not match app backend.',
        });
        return;
      }

      res.status(401).json({ error: 'Invalid SSO token. Please sign in again.' });
      return;
    }

    res.status(401).json({ error: 'Invalid or expired SSO token' });
    return;
  }

  const ssoEmail = (decoded.solarpro_email ?? decoded.email ?? '').trim().toLowerCase();
  const ssoName = (decoded.solarpro_name ?? decoded.name ?? 'SolarPro User').trim();

  if (!ssoEmail) {
    res.status(422).json({ error: 'SSO token missing email claim' });
    return;
  }

  if (!decoded.jti) {
    res.status(422).json({ error: 'SSO token missing jti claim' });
    return;
  }

  try {
    await ensureSolarProSsoTokensTable();

    try {
      await pool.query(`INSERT INTO used_solarpro_sso_tokens (jti) VALUES ($1)`, [decoded.jti]);
    } catch (insertErr) {
      const err = insertErr as { code?: string };
      if (err.code === '23505') {
        res.status(409).json({ error: 'SSO token has already been used' });
        return;
      }
      throw insertErr;
    }

    let user = await getUserByEmail(ssoEmail);

    if (!user) {
      const randomPassword = randomBytes(32).toString('hex');
      user = await createUser(ssoEmail, randomPassword, ssoName);
      authAudit('users.solarpro-sso.created', req, ssoEmail, { userId: user.id });
    } else {
      authAudit('users.solarpro-sso.matched', req, ssoEmail, { userId: user.id });
    }

    if (decoded.solarpro_user_id || decoded.solarpro_project_id || decoded.solarpro_org_id) {
      console.log('[SSO OWNER STORED]', {
        solarpro_user_id: decoded.solarpro_user_id ?? null,
        solarpro_project_id: decoded.solarpro_project_id ?? null,
        solarpro_org_id: decoded.solarpro_org_id ?? null,
        solarpro_email: decoded.solarpro_email ?? null,
        jti: decoded.jti ?? null,
      });
    }

    const isAdmin = isElevatedAdminEmail(user.email);
    const accessToken = signAuthToken({
      userId: user.id,
      email: user.email,
      role: isAdmin ? 'admin' : 'user',
    });
    const refreshToken = await issueRefreshToken(user.id, user.email, user.full_name);

    authAudit('users.solarpro-sso.success', req, user.email, { status: 200, userId: user.id });

    res.json({
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: isAdmin ? 'admin' : 'user',
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('POST /api/users/solarpro-sso error:', err);
    authAudit('users.solarpro-sso.error', req, ssoEmail, { status: 500 });
    res.status(500).json({ error: 'SSO login failed' });
  }
});

// DELETE /api/users/me
router.delete('/me', requireAuth, async (req: Request, res: Response) => {
  const userId = req.authUser?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (userId === ADMIN_USER.id || req.authUser?.role === 'admin') {
    res.status(403).json({ error: 'Admin account cannot be deleted via this endpoint' });
    return;
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await pool.query('DELETE FROM surveys WHERE inspector_name = $1', [user.full_name]);

    await deleteRefreshTokensByUserId(userId);
    const deleted = await deleteUserById(userId);

    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/users/me error:', err);
    res.status(500).json({ error: 'Failed to delete user account' });
  }
});

// GET /api/users/admin/table (admin only)
router.get('/admin/table', requireAuth, async (req: Request, res: Response) => {
  const isAdmin = req.authUser?.role === 'admin' || isElevatedAdminEmail(req.authUser?.email || '');
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  try {
    const users = await listUsersWithHashMetadata();
    res.json({
      users,
      total: users.length,
      hashing: {
        local_password_scheme: 'scrypt(salt:derived)',
        supports_legacy_bcrypt: true,
      },
    });
  } catch (err) {
    console.error('GET /api/users/admin/table error:', err);
    res.status(500).json({ error: 'Failed to retrieve users table data' });
  }
});

export default router;
