import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
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

let refreshTableReady: Promise<void> | null = null;
let websitePool: Pool | null | undefined;
let websiteUsersShapeReady: Promise<{ nameColumn: 'name' | 'full_name' }> | null = null;

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

function getWebsitePool(): Pool {
  if (websitePool) return websitePool;
  if (websitePool === null) {
    throw new Error('Website database is not configured. Set WEBSITE_DATABASE_URL, SOURCE_DATABASE_URL, or DATABASE_URL.');
  }

  const connectionString = getEnv('WEBSITE_DATABASE_URL') || getEnv('SOURCE_DATABASE_URL') || getEnv('DATABASE_URL');
  if (!connectionString) {
    websitePool = null;
    throw new Error('Website database is not configured. Set WEBSITE_DATABASE_URL, SOURCE_DATABASE_URL, or DATABASE_URL.');
  }

  websitePool = new Pool({
    connectionString,
    ssl: resolveSsl(connectionString),
    max: 5,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 5_000,
  });

  websitePool.on('error', (err) => {
    console.error('Website PostgreSQL pool error', err);
  });

  return websitePool;
}

function ensureRefreshTokenTable(): Promise<void> {
  if (!refreshTableReady) {
    refreshTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          email VARCHAR(255),
          full_name VARCHAR(255),
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          revoked BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
      await pool.query(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)`);

      await pool.query('CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens(token_hash)');
      await pool.query('CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id)');
      await pool.query('CREATE INDEX IF NOT EXISTS refresh_tokens_email_idx ON refresh_tokens(email)');
    })().catch((error) => {
      refreshTableReady = null;
      throw error;
    });
  }

  return refreshTableReady;
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

type WebsiteUserRecord = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  created_at: string;
};

function mapWebsiteUser(row: WebsiteUserRecord): AuthUserRecord {
  const normalizedName = (row.full_name || '').trim();
  return {
    id: row.id,
    email: row.email,
    full_name: normalizedName.length > 0 ? normalizedName : row.email.split('@')[0],
    created_at: row.created_at,
  };
}

async function resolveWebsiteUsersShape(): Promise<{ nameColumn: 'name' | 'full_name' }> {
  if (!websiteUsersShapeReady) {
    websiteUsersShapeReady = (async () => {
      const sourcePool = getWebsitePool();
      const { rows } = await sourcePool.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'`,
      );

      const columns = new Set(rows.map((r) => r.column_name));
      const nameColumn: 'name' | 'full_name' = columns.has('full_name') ? 'full_name' : 'name';
      return { nameColumn };
    })().catch((error) => {
      websiteUsersShapeReady = null;
      throw error;
    });
  }

  return websiteUsersShapeReady;
}

async function findWebsiteUserByEmail(email: string): Promise<(AuthUserRecord & { password_hash: string }) | null> {
  const sourcePool = getWebsitePool();
  const shape = await resolveWebsiteUsersShape();
  const { rows } = await sourcePool.query<WebsiteUserRecord>(
    `SELECT id::text,
            email::text,
            password_hash::text,
            COALESCE(${shape.nameColumn}::text, '') AS full_name,
            created_at::text
       FROM users
      WHERE lower(email::text) = lower($1::text)
      LIMIT 1`,
    [email],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    ...mapWebsiteUser(row),
    password_hash: row.password_hash,
  };
}

async function findWebsiteUserById(userId: string): Promise<AuthUserRecord | null> {
  const sourcePool = getWebsitePool();
  const shape = await resolveWebsiteUsersShape();
  const { rows } = await sourcePool.query<WebsiteUserRecord>(
    `SELECT id::text,
            email::text,
            password_hash::text,
            COALESCE(${shape.nameColumn}::text, '') AS full_name,
            created_at::text
       FROM users
      WHERE id::text = $1
      LIMIT 1`,
    [userId],
  );

  const row = rows[0];
  if (!row) return null;
  return mapWebsiteUser(row);
}

export async function getUserById(userId: string): Promise<AuthUserRecord | null> {
  return findWebsiteUserById(userId);
}

export async function getUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const user = await findWebsiteUserByEmail(email);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    created_at: user.created_at,
  };
}

export async function createUser(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthUserRecord> {
  const sourcePool = getWebsitePool();
  const shape = await resolveWebsiteUsersShape();

  const id = randomUUID();
  const passwordHash = hashPassword(password);

  const { rows } = await sourcePool.query<AuthUserRecord>(
    `INSERT INTO users (id, email, password_hash, ${shape.nameColumn}, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, NOW(), NOW())
     RETURNING id::text,
               email::text,
               COALESCE(${shape.nameColumn}::text, '') AS full_name,
               created_at::text`,
    [id, email, passwordHash, fullName],
  );

  return rows[0];
}

export async function verifyUserCredentials(
  email: string,
  password: string,
): Promise<AuthUserRecord | null> {
  const websiteUser = await findWebsiteUserByEmail(email);
  if (!websiteUser) return null;

  const storedHash = websiteUser.password_hash;
  let isValid = false;

  if (storedHash.includes(':')) {
    isValid = verifyPassword(password, storedHash);
  } else if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    isValid = await bcrypt.compare(password, storedHash);

    if (isValid) {
      await getWebsitePool().query(
        `UPDATE users
            SET password_hash = $2,
                updated_at = NOW()
          WHERE id::text = $1`,
        [websiteUser.id, hashPassword(password)],
      );
    }
  }

  if (!isValid) return null;

  return {
    id: websiteUser.id,
    email: websiteUser.email,
    full_name: websiteUser.full_name,
    created_at: websiteUser.created_at,
  };
}

export async function updateUserPasswordByEmail(
  email: string,
  newPassword: string,
): Promise<{ id: string } | null> {
  const sourcePool = getWebsitePool();

  const { rows } = await sourcePool.query<{ id: string }>(
    `UPDATE users
        SET password_hash = $2,
            updated_at = NOW()
      WHERE lower(email::text) = lower($1::text)
      RETURNING id::text`,
    [email, hashPassword(newPassword)],
  );

  return rows[0] || null;
}

export async function insertRefreshToken(
  userId: string,
  email: string,
  fullName: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await ensureRefreshTokenTable();

  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, email, full_name, token_hash, expires_at, revoked)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
    [randomUUID(), userId, email, fullName, tokenHash, expiresAt.toISOString()],
  );
}

export async function getRefreshTokenWithUserByHash(
  tokenHash: string,
): Promise<RefreshTokenWithUserRecord | null> {
  await ensureRefreshTokenTable();

  const { rows } = await pool.query<RefreshTokenWithUserRecord>(
    `SELECT id::text,
            user_id::text,
            expires_at::text,
            CASE WHEN revoked THEN 1 ELSE 0 END AS revoked,
            COALESCE(email, '') AS email,
            COALESCE(full_name, '') AS full_name
     FROM refresh_tokens
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );

  const row = rows[0];
  if (!row) return null;

  if (row.email && row.full_name) {
    return row;
  }

  const websiteUser = await findWebsiteUserById(row.user_id);
  if (!websiteUser) {
    return row;
  }

  if (!row.email || !row.full_name) {
    await pool.query(
      `UPDATE refresh_tokens
          SET email = COALESCE(email, $2),
              full_name = COALESCE(full_name, $3)
        WHERE id = $1`,
      [row.id, websiteUser.email, websiteUser.full_name],
    );
  }

  return {
    ...row,
    email: websiteUser.email,
    full_name: websiteUser.full_name,
  };
}

export async function revokeRefreshTokenById(tokenId: string): Promise<void> {
  await ensureRefreshTokenTable();
  await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [tokenId]);
}

export async function revokeRefreshTokensByUserId(userId: string): Promise<void> {
  await ensureRefreshTokenTable();
  await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id::text = $1', [userId]);
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await ensureRefreshTokenTable();
  await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);
}

export async function deleteRefreshTokensByUserId(userId: string): Promise<void> {
  await ensureRefreshTokenTable();
  await pool.query('DELETE FROM refresh_tokens WHERE user_id::text = $1', [userId]);
}

export async function deleteUserById(userId: string): Promise<boolean> {
  const sourcePool = getWebsitePool();
  const result = await sourcePool.query('DELETE FROM users WHERE id::text = $1', [userId]);
  return (result.rowCount ?? 0) > 0;
}



