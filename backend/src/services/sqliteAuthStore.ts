import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { Pool } from 'pg';
import { pool } from '../database';

export interface AuthUserRecord {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

export interface RefreshTokenWithUserRecord {
  id: string;
  user_id: string;
  expires_at: string;
  revoked: number;
  email: string;
  full_name: string;
}

let authTablesReady: Promise<void> | null = null;
let websitePool: Pool | null | undefined;

function getEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function resolveSsl(connectionString: string): false | { rejectUnauthorized: false } {
  try {
    const parsed = new URL(connectionString);
    const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();
    const ssl = parsed.searchParams.get('ssl')?.toLowerCase();

    if (ssl === 'true') return { rejectUnauthorized: false };
    if (sslmode && sslmode !== 'disable') return { rejectUnauthorized: false };

    const hostname = parsed.hostname.toLowerCase();
    if (hostname.endsWith('.render.com')) return { rejectUnauthorized: false };
  } catch {
    // fall through
  }

  return false;
}

function getWebsitePool(): Pool | null {
  if (websitePool !== undefined) return websitePool;

  const connectionString = getEnv('WEBSITE_DATABASE_URL') || getEnv('SOURCE_DATABASE_URL');
  if (!connectionString) {
    websitePool = null;
    return websitePool;
  }

  websitePool = new Pool({
    connectionString,
    ssl: resolveSsl(connectionString),
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  websitePool.on('error', (err) => {
    console.error('Website PostgreSQL pool error', err);
  });

  return websitePool;
}

function ensureAuthTables(): Promise<void> {
  if (!authTablesReady) {
    authTablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          revoked BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query('CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)');
      await pool.query('CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens(token_hash)');
      await pool.query('CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id)');
    })().catch((error) => {
      authTablesReady = null;
      throw error;
    });
  }

  return authTablesReady;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;

  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function verifyLegacyBcryptPasswordInPool(
  targetPool: Pool,
  email: string,
  password: string,
): Promise<boolean> {
  try {
    const { rows } = await targetPool.query<{ valid: boolean }>(
      `SELECT (password_hash = crypt($2, password_hash)) AS valid
         FROM users
        WHERE lower(email::text) = lower($1::text)
        LIMIT 1`,
      [email, password],
    );

    return Boolean(rows[0]?.valid);
  } catch {
    return false;
  }
}

async function verifyLegacyBcryptPasswordInDb(
  email: string,
  password: string,
): Promise<boolean> {
  return verifyLegacyBcryptPasswordInPool(pool, email, password);
}

type WebsiteUserRecord = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  created_at: string;
};

function normalizeFallbackName(email: string, fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed.length > 0) return trimmed;

  const localPart = email.split('@')[0]?.trim();
  return localPart && localPart.length > 0 ? localPart : 'User';
}

async function tryWebsiteCredentialFallback(
  email: string,
  password: string,
): Promise<AuthUserRecord | null> {
  const sourcePool = getWebsitePool();
  if (!sourcePool) return null;

  const { rows } = await sourcePool.query<WebsiteUserRecord>(
    `SELECT id::text,
            email::text,
            password_hash::text,
            COALESCE(full_name::text, name::text, '') AS full_name,
            created_at::text
       FROM users
      WHERE lower(email::text) = lower($1::text)
      LIMIT 1`,
    [email],
  );

  const websiteUser = rows[0];
  if (!websiteUser) return null;

  const sourceHash = websiteUser.password_hash;
  let isValid = false;

  if (sourceHash.includes(':')) {
    isValid = verifyPassword(password, sourceHash);
  } else if (sourceHash.startsWith('$2a$') || sourceHash.startsWith('$2b$') || sourceHash.startsWith('$2y$')) {
    isValid = await verifyLegacyBcryptPasswordInPool(sourcePool, email, password);
  }

  if (!isValid) return null;

  const syncedHash = sourceHash.includes(':') ? sourceHash : hashPassword(password);
  const syncedName = normalizeFallbackName(websiteUser.email, websiteUser.full_name);

  const { rows: syncedRows } = await pool.query<AuthUserRecord>(
    `INSERT INTO users (id, email, password_hash, full_name, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, NOW())
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           updated_at = NOW()
     RETURNING id::text, email, full_name, created_at::text`,
    [websiteUser.id, websiteUser.email, syncedHash, syncedName, websiteUser.created_at],
  );

  return syncedRows[0] || null;
}

function verifyLocalPassword(
  email: string,
  password: string,
  storedHash: string,
): boolean | Promise<boolean> {
  if (storedHash.includes(':')) {
    return verifyPassword(password, storedHash);
  } else if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return verifyLegacyBcryptPasswordInDb(email, password);
  }
  return false;
}

export async function getUserById(userId: string): Promise<AuthUserRecord | null> {
  await ensureAuthTables();

  const { rows } = await pool.query<AuthUserRecord>(
    `SELECT id::text, email, full_name, created_at::text
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );

  return rows[0] || null;
}

export async function getUserByEmail(email: string): Promise<AuthUserRecord | null> {
  await ensureAuthTables();

  const { rows } = await pool.query<AuthUserRecord>(
    `SELECT id::text, email, full_name, created_at::text
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email],
  );

  return rows[0] || null;
}

export async function createUser(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthUserRecord> {
  await ensureAuthTables();

  const id = randomUUID();
  const passwordHash = hashPassword(password);

  const { rows } = await pool.query<AuthUserRecord>(
    `INSERT INTO users (id, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text, email, full_name, created_at::text`,
    [id, email, passwordHash, fullName],
  );

  return rows[0];
}

export async function verifyUserCredentials(
  email: string,
  password: string,
): Promise<AuthUserRecord | null> {
  await ensureAuthTables();

  const { rows } = await pool.query<
    AuthUserRecord & {
      password_hash: string;
    }
  >(
    `SELECT id::text, email, full_name, created_at::text, password_hash
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email],
  );

  const row = rows[0];

  if (!row) {
    return tryWebsiteCredentialFallback(email, password);
  }

  const storedHash = row.password_hash;
  let isValid = false;

  if (storedHash.includes(':')) {
    isValid = verifyPassword(password, storedHash);
  } else if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    isValid = await verifyLegacyBcryptPasswordInDb(email, password);

    if (isValid) {
      await pool.query(
        `UPDATE users
            SET password_hash = $2,
                updated_at = NOW()
          WHERE id = $1`,
        [row.id, hashPassword(password)],
      );
    }
  }

  if (isValid) {
    return {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      created_at: row.created_at,
    };
  }

  return tryWebsiteCredentialFallback(email, password);
}

export async function updateUserPasswordByEmail(
  email: string,
  newPassword: string,
): Promise<{ id: string } | null> {
  await ensureAuthTables();

  const { rows } = await pool.query<{ id: string }>(
    `UPDATE users
     SET password_hash = $2, updated_at = NOW()
     WHERE email = $1
     RETURNING id::text`,
    [email, hashPassword(newPassword)],
  );

  return rows[0] || null;
}

export async function insertRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await ensureAuthTables();

  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked)
     VALUES ($1, $2, $3, $4, FALSE)`,
    [randomUUID(), userId, tokenHash, expiresAt.toISOString()],
  );
}

export async function getRefreshTokenWithUserByHash(
  tokenHash: string,
): Promise<RefreshTokenWithUserRecord | null> {
  await ensureAuthTables();

  const { rows } = await pool.query<RefreshTokenWithUserRecord>(
    `SELECT rt.id::text,
            rt.user_id::text,
            rt.expires_at::text,
            CASE WHEN rt.revoked THEN 1 ELSE 0 END AS revoked,
            u.email,
            u.full_name
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );

  return rows[0] || null;
}

export async function revokeRefreshTokenById(tokenId: string): Promise<void> {
  await ensureAuthTables();
  await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [tokenId]);
}

export async function revokeRefreshTokensByUserId(userId: string): Promise<void> {
  await ensureAuthTables();
  await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await ensureAuthTables();
  await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);
}

export async function deleteRefreshTokensByUserId(userId: string): Promise<void> {
  await ensureAuthTables();
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

export async function deleteUserById(userId: string): Promise<boolean> {
  await ensureAuthTables();
  const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  return (result.rowCount ?? 0) > 0;
}
