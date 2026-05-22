import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  username?: string;
  role?: 'user' | 'admin';
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error('JWT_SECRET is required for auth token operations');
  }
  return secret;
}

function getAccessTokenTTL(): jwt.SignOptions['expiresIn'] {
  // Default to 30 days — long-lived for admin/mobile convenience.
  // Override with JWT_ACCESS_TTL env var (e.g. "30d", "1h").
  return (process.env.JWT_ACCESS_TTL || '30d') as jwt.SignOptions['expiresIn'];
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: getAccessTokenTTL() });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (!decoded || typeof decoded !== 'object') return null;

    const maybePayload = decoded as Partial<AuthTokenPayload>;
    if (typeof maybePayload.userId !== 'string' || typeof maybePayload.email !== 'string') {
      return null;
    }

    return {
      userId: maybePayload.userId,
      email: maybePayload.email,
      username: typeof maybePayload.username === 'string' ? maybePayload.username : undefined,
      role: maybePayload.role === 'admin' ? 'admin' : 'user',
    };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------
// Refresh token helpers
// ----------------------------------------------------------------

const REFRESH_TOKEN_TTL_MS =
  parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10) * 24 * 60 * 60 * 1000;

/** Generates a cryptographically random raw refresh token string. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

/** Returns the SHA-256 hash of a raw refresh token for DB storage. */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Returns the Date at which a freshly issued refresh token expires. */
export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}
