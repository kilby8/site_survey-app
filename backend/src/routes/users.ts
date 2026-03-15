import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { signAuthToken } from '../utils/authToken';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { authAudit } from '../utils/authAudit';

const router = Router();
let usersTableReady = false;

interface AuthBody {
  email?: string;
  password?: string;
  full_name?: string;
}

interface SignInAttemptState {
  failures: number;
  firstFailureAt: number;
  lockedUntil?: number;
}

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
const signInAttemptMap = new Map<string, SignInAttemptState>();

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function attemptKey(req: Request, email: string): string {
  return `${getClientIp(req)}:${email}`;
}

function getSignInState(key: string): SignInAttemptState {
  const now = Date.now();
  const existing = signInAttemptMap.get(key);

  if (!existing) {
    const state: SignInAttemptState = { failures: 0, firstFailureAt: now };
    signInAttemptMap.set(key, state);
    return state;
  }

  if (existing.firstFailureAt + SIGNIN_WINDOW_MS < now) {
    const reset: SignInAttemptState = { failures: 0, firstFailureAt: now };
    signInAttemptMap.set(key, reset);
    return reset;
  }

  return existing;
}

function isSignInLocked(state: SignInAttemptState): boolean {
  return typeof state.lockedUntil === 'number' && state.lockedUntil > Date.now();
}

function recordSignInFailure(state: SignInAttemptState): void {
  state.failures += 1;
  if (state.failures >= SIGNIN_MAX_FAILURES) {
    state.lockedUntil = Date.now() + SIGNIN_LOCK_MS;
  }
}

function clearSignInFailures(key: string): void {
  signInAttemptMap.delete(key);
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
  message: 'Too many profile requests. Please try again later.',
});

function cleanEmail(email?: string): string {
  return (email || '').trim().toLowerCase();
}

async function ensureUsersTable(): Promise<void> {
  if (usersTableReady) return;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );

  await pool.query('CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)');
  usersTableReady = true;
}

// GET /api/users/me
router.get('/me', requireAuth, meRateLimit, async (req: Request, res: Response) => {
  try {
    await ensureUsersTable();

    const userId = req.authUser?.userId;
    if (!userId) {
      authAudit('users.me.unauthorized', req, req.authUser?.email, { status: 401, reason: 'missing-auth-user' });
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, email, full_name, created_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (!rows[0]) {
      authAudit('users.me.not_found', req, req.authUser?.email, { status: 404, userId });
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = rows[0];
    authAudit('users.me.success', req, user.email, { status: 200, userId });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
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
    await ensureUsersTable();

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rowCount && existing.rowCount > 0) {
      authAudit('users.register.conflict', req, normalizedEmail, { status: 409, reason: 'email-exists' });
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, crypt($2, gen_salt('bf')), $3)
       RETURNING id, email, full_name, created_at`,
      [normalizedEmail, password, displayName]
    );

    const user = rows[0];
    const token = signAuthToken({ userId: user.id, email: user.email });
  authAudit('users.register.success', req, user.email, { status: 201, userId: user.id });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
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
  const { email, password } = req.body as AuthBody;
  const normalizedEmail = cleanEmail(email);

  authAudit('users.signin.attempt', req, normalizedEmail);

  if (!normalizedEmail || !password) {
    authAudit('users.signin.reject', req, normalizedEmail, { status: 400, reason: 'missing-fields' });
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    await ensureUsersTable();

    const key = attemptKey(req, normalizedEmail);
    const state = getSignInState(key);

    if (isSignInLocked(state)) {
      authAudit('users.signin.locked', req, normalizedEmail, { status: 429, reason: 'active-lockout' });
      res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, email, full_name, created_at
       FROM users
       WHERE email = $1 AND password_hash = crypt($2, password_hash)
       LIMIT 1`,
      [normalizedEmail, password]
    );

    if (!rows[0]) {
      recordSignInFailure(state);
      if (isSignInLocked(state)) {
        authAudit('users.signin.locked', req, normalizedEmail, { status: 429, reason: 'lockout-threshold-reached' });
        res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
        return;
      }
      authAudit('users.signin.failure', req, normalizedEmail, { status: 401, reason: 'invalid-credentials' });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = rows[0];
    clearSignInFailures(key);
    const token = signAuthToken({ userId: user.id, email: user.email });
    authAudit('users.signin.success', req, user.email, { status: 200, userId: user.id });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('POST /api/users/signin error:', err);
    authAudit('users.signin.error', req, normalizedEmail, { status: 500 });
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

export default router;
