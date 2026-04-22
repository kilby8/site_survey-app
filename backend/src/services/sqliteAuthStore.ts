import path from 'path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import Database from 'better-sqlite3';

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

let dbReady = false;
const dbPath = process.env.SQLITE_AUTH_DB_PATH || path.join(__dirname, '..', '..', 'auth.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

actionEnsureReady();

function actionEnsureReady(): void {
  if (dbReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      token_hash  TEXT NOT NULL UNIQUE,
      expires_at  TEXT NOT NULL,
      revoked     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
  `);

  dbReady = true;
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

export async function getUserById(userId: string): Promise<AuthUserRecord | null> {
  actionEnsureReady();
  const row = db
    .prepare(
      `SELECT id, email, full_name, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .get(userId) as AuthUserRecord | undefined;

  return row || null;
}

export async function getUserByEmail(email: string): Promise<AuthUserRecord | null> {
  actionEnsureReady();
  const row = db
    .prepare(
      `SELECT id, email, full_name, created_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
    )
    .get(email) as AuthUserRecord | undefined;

  return row || null;
}

export async function createUser(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthUserRecord> {
  actionEnsureReady();

  const now = new Date().toISOString();
  const id = randomUUID();
  const passwordHash = hashPassword(password);

  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, email, passwordHash, fullName, now, now);

  return {
    id,
    email,
    full_name: fullName,
    created_at: now,
  };
}

export async function verifyUserCredentials(
  email: string,
  password: string,
): Promise<AuthUserRecord | null> {
  actionEnsureReady();

  const row = db
    .prepare(
      `SELECT id, email, full_name, created_at, password_hash
       FROM users
       WHERE email = ?
       LIMIT 1`,
    )
    .get(email) as
    | (AuthUserRecord & {
        password_hash: string;
      })
    | undefined;

  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    created_at: row.created_at,
  };
}

export async function updateUserPasswordByEmail(
  email: string,
  newPassword: string,
): Promise<{ id: string } | null> {
  actionEnsureReady();

  const user = db
    .prepare('SELECT id FROM users WHERE email = ? LIMIT 1')
    .get(email) as { id: string } | undefined;

  if (!user) return null;

  db.prepare(
    `UPDATE users
     SET password_hash = ?, updated_at = ?
     WHERE email = ?`,
  ).run(hashPassword(newPassword), new Date().toISOString(), email);

  return user;
}

export async function insertRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  actionEnsureReady();

  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
  ).run(randomUUID(), userId, tokenHash, expiresAt.toISOString(), new Date().toISOString());
}

export async function getRefreshTokenWithUserByHash(
  tokenHash: string,
): Promise<RefreshTokenWithUserRecord | null> {
  actionEnsureReady();

  const row = db
    .prepare(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked,
              u.email, u.full_name
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ?
       LIMIT 1`,
    )
    .get(tokenHash) as RefreshTokenWithUserRecord | undefined;

  return row || null;
}

export async function revokeRefreshTokenById(tokenId: string): Promise<void> {
  actionEnsureReady();
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(tokenId);
}

export async function revokeRefreshTokensByUserId(userId: string): Promise<void> {
  actionEnsureReady();
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  actionEnsureReady();
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
}

export async function deleteRefreshTokensByUserId(userId: string): Promise<void> {
  actionEnsureReady();
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

export async function deleteUserById(userId: string): Promise<boolean> {
  actionEnsureReady();
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return result.changes > 0;
}
