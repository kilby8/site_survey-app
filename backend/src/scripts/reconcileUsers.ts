import { Pool } from "pg";
import path from "path";

if (process.env.NODE_ENV !== "production") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
  } catch {
    // dotenv optional
  }
}

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  created_at: string;
  updated_at: string;
};

type NormalizedUser = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
};

type UsersTableShape = {
  passwordColumn: "password_hash" | "password";
  fullNameColumn: "full_name" | "name";
};

function getArgFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = getEnv(name);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable. Expected one of: ${names.join(", ")}`);
}

function resolveSsl(connectionString: string): false | { rejectUnauthorized: false } {
  try {
    const parsed = new URL(connectionString);
    const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const ssl = parsed.searchParams.get("ssl")?.toLowerCase();

    if (ssl === "true") return { rejectUnauthorized: false };
    if (sslmode && sslmode !== "disable") return { rejectUnauthorized: false };

    const hostname = parsed.hostname.toLowerCase();
    if (hostname.endsWith(".render.com")) return { rejectUnauthorized: false };
  } catch {
    // fall through
  }

  return false;
}

function summarizeDb(url: string): string {
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, "") || "(unknown-db)";
    const port = parsed.port || (parsed.protocol === "postgresql:" ? "5432" : "");
    return `${parsed.hostname}${port ? `:${port}` : ""}/${db}`;
  } catch {
    return "(invalid-url)";
  }
}

function normalizeUser(row: UserRow): NormalizedUser {
  return {
    id: row.id,
    email: row.email.trim().toLowerCase(),
    passwordHash: row.password_hash,
    fullName: row.full_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertUsersTable(pool: Pool, label: string): Promise<void> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'users'
     ) AS exists`,
  );

  if (!rows[0]?.exists) {
    throw new Error(`${label} database is missing public.users table`);
  }
}

async function resolveUsersTableShape(pool: Pool, label: string): Promise<UsersTableShape> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'`,
  );

  const columns = new Set(rows.map((r) => r.column_name));

  const passwordColumn = columns.has("password_hash")
    ? "password_hash"
    : columns.has("password")
      ? "password"
      : null;

  const fullNameColumn = columns.has("full_name")
    ? "full_name"
    : columns.has("name")
      ? "name"
      : null;

  if (!passwordColumn) {
    throw new Error(`${label} users table is missing password_hash/password column`);
  }

  if (!fullNameColumn) {
    throw new Error(`${label} users table is missing full_name/name column`);
  }

  return { passwordColumn, fullNameColumn };
}

async function readUsers(pool: Pool, shape: UsersTableShape): Promise<Map<string, NormalizedUser>> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id::text,
            email,
            ${shape.passwordColumn}::text AS password_hash,
            ${shape.fullNameColumn}::text AS full_name,
            created_at::text,
            updated_at::text
       FROM users`,
  );

  const map = new Map<string, NormalizedUser>();
  for (const row of rows) {
    const normalized = normalizeUser(row);
    map.set(normalized.email, normalized);
  }
  return map;
}

async function main(): Promise<void> {
  const apply = getArgFlag("--apply");
  const syncMissing = getArgFlag("--sync-missing");
  const syncMismatch = getArgFlag("--sync-mismatch");

  const websiteUrl = requiredEnv("WEBSITE_DATABASE_URL", "SOURCE_DATABASE_URL");
  const appUrl = requiredEnv("APP_DATABASE_URL", "TARGET_DATABASE_URL");

  const websitePool = new Pool({ connectionString: websiteUrl, ssl: resolveSsl(websiteUrl) });
  const appPool = new Pool({ connectionString: appUrl, ssl: resolveSsl(appUrl) });

  try {
    console.log("[USER RECONCILE] website:", summarizeDb(websiteUrl));
    console.log("[USER RECONCILE] app:", summarizeDb(appUrl));

    await assertUsersTable(websitePool, "website");
    await assertUsersTable(appPool, "app");

    const [websiteShape, appShape] = await Promise.all([
      resolveUsersTableShape(websitePool, "website"),
      resolveUsersTableShape(appPool, "app"),
    ]);

    const [websiteUsers, appUsers] = await Promise.all([
      readUsers(websitePool, websiteShape),
      readUsers(appPool, appShape),
    ]);

    const websiteOnly: NormalizedUser[] = [];
    const appOnly: NormalizedUser[] = [];
    const mismatchHash: Array<{ email: string; website: NormalizedUser; app: NormalizedUser }> = [];
    const mismatchName: Array<{ email: string; website: NormalizedUser; app: NormalizedUser }> = [];

    for (const [email, websiteUser] of websiteUsers.entries()) {
      const appUser = appUsers.get(email);
      if (!appUser) {
        websiteOnly.push(websiteUser);
        continue;
      }

      if (websiteUser.passwordHash !== appUser.passwordHash) {
        mismatchHash.push({ email, website: websiteUser, app: appUser });
      }

      if (websiteUser.fullName !== appUser.fullName) {
        mismatchName.push({ email, website: websiteUser, app: appUser });
      }
    }

    for (const [email, appUser] of appUsers.entries()) {
      if (!websiteUsers.has(email)) {
        appOnly.push(appUser);
      }
    }

    console.log("\n[USER RECONCILE] Summary");
    console.log(`website users: ${websiteUsers.size}`);
    console.log(`app users: ${appUsers.size}`);
    console.log(`website-only users: ${websiteOnly.length}`);
    console.log(`app-only users: ${appOnly.length}`);
    console.log(`password mismatches: ${mismatchHash.length}`);
    console.log(`full name mismatches: ${mismatchName.length}`);

    if (websiteOnly.length > 0) {
      console.log("\n[USER RECONCILE] website-only (first 20)");
      websiteOnly.slice(0, 20).forEach((u) => console.log(`- ${u.email}`));
    }

    if (mismatchHash.length > 0) {
      console.log("\n[USER RECONCILE] password mismatches (first 20)");
      mismatchHash.slice(0, 20).forEach((m) => console.log(`- ${m.email}`));
    }

    if (!apply) {
      console.log("\n[USER RECONCILE] Dry run only. Add --apply to write changes to app DB.");
      return;
    }

    const effectiveSyncMissing = syncMissing || (!syncMissing && !syncMismatch);
    const effectiveSyncMismatch = syncMismatch;

    let inserted = 0;
    let updated = 0;

    const appClient = await appPool.connect();
    try {
      await appClient.query("BEGIN");

      if (effectiveSyncMissing) {
        for (const user of websiteOnly) {
          await appClient.query(
            `INSERT INTO users (id, email, ${appShape.passwordColumn}, ${appShape.fullNameColumn}, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, NOW())
             ON CONFLICT (email) DO NOTHING`,
            [user.id, user.email, user.passwordHash, user.fullName, user.createdAt],
          );
          inserted += 1;
        }
      }

      if (effectiveSyncMismatch) {
        for (const mismatch of mismatchHash) {
          await appClient.query(
            `UPDATE users
                SET ${appShape.passwordColumn} = $2,
                    ${appShape.fullNameColumn} = $3,
                    updated_at = NOW()
              WHERE email = $1`,
            [mismatch.email, mismatch.website.passwordHash, mismatch.website.fullName],
          );
          updated += 1;
        }
      }

      await appClient.query("COMMIT");
    } catch (error) {
      await appClient.query("ROLLBACK");
      throw error;
    } finally {
      appClient.release();
    }

    console.log("\n[USER RECONCILE] Apply complete");
    console.log(`inserted into app DB: ${inserted}`);
    console.log(`updated in app DB: ${updated}`);
  } finally {
    await Promise.all([websitePool.end(), appPool.end()]);
  }
}

main().catch((error) => {
  console.error("[USER RECONCILE] Failed:", error);
  process.exit(1);
});
