import { Pool, PoolClient } from 'pg';
import path from 'path';

// Load .env when running in development
if (process.env.NODE_ENV !== 'production') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch { /* dotenv optional */ }
}

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function resolveSsl(connectionString?: string): false | { rejectUnauthorized: false } {
  const dbSsl = parseBooleanEnv(process.env.DB_SSL);
  if (dbSsl === true) return { rejectUnauthorized: false };
  if (dbSsl === false) return false;

  if (!connectionString) return false;

  try {
    const parsed = new URL(connectionString);
    const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();
    const ssl = parsed.searchParams.get('ssl')?.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (ssl === 'true') return { rejectUnauthorized: false };
    if (sslmode && sslmode !== 'disable') return { rejectUnauthorized: false };

    // Render external hosts generally need SSL. Internal hosts (no dot) do not.
    if (hostname.endsWith('.render.com')) {
      return { rejectUnauthorized: false };
    }
  } catch {
    // If DATABASE_URL is malformed, let pg surface a clear connection error later.
  }

  return false;
}

function resolvePoolConfig(): ConstructorParameters<typeof Pool>[0] {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (connectionString) {
    return {
      connectionString,
      ssl: resolveSsl(connectionString),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };
  }

  const host = process.env.DB_HOST?.trim();
  const port = process.env.DB_PORT?.trim();
  const database = process.env.DB_NAME?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;

  const hasDiscreteDbConfig = Boolean(host && port && database && user && password);

  if (hasDiscreteDbConfig) {
    return {
      host,
      port: parseInt(port as string, 10),
      database,
      user,
      password,
      ssl: resolveSsl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };
  }

  // Never silently fall back to localhost in production-like environments.
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    const message =
      'Missing Database Configuration: set DATABASE_URL (preferred) or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.';
    console.error(message);
    throw new Error(message);
  }

  // Local dev fallback
  return {
    host: 'localhost',
    port: 5432,
    database: 'site_survey',
    user: 'survey_user',
    password: 'survey_pass_2024',
    ssl: false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
}

const pool = new Pool(resolvePoolConfig());

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

export { pool };
export type { PoolClient };
