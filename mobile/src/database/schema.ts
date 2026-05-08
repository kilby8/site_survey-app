/**
 * database/schema.ts
 *
 * SQL statements to initialise the local SQLite database.
 * Mirrors the PostgreSQL schema so offline surveys sync cleanly.
 */

export const CREATE_SURVEYS_TABLE = `
  CREATE TABLE IF NOT EXISTS surveys (
    id             TEXT    PRIMARY KEY,
    project_name   TEXT    NOT NULL,
    project_id     TEXT,
    category_id    TEXT,
    category_name  TEXT,
    inspector_name TEXT    NOT NULL,
    site_name      TEXT    NOT NULL,
    site_address   TEXT    DEFAULT '',
    latitude       REAL,
    longitude      REAL,
    gps_accuracy   REAL,
    survey_date    TEXT    NOT NULL,
    notes          TEXT    DEFAULT '',
    status         TEXT    NOT NULL DEFAULT 'draft',
    sync_status    TEXT    NOT NULL DEFAULT 'pending',
    sync_error     TEXT,
    device_id      TEXT,
    -- SolarPro ownership fields — carry the project/user context through offline sync
    solarpro_user_id    TEXT,
    solarpro_project_id TEXT,
    solarpro_email      TEXT,
    solarpro_org_id     TEXT,
    -- Category-specific fields stored as a JSON string (mirrors server JSONB column)
    metadata       TEXT,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
  );
`;

export const CREATE_CHECKLIST_TABLE = `
  CREATE TABLE IF NOT EXISTS checklist_items (
    id         TEXT    PRIMARY KEY,
    survey_id  TEXT    NOT NULL,
    label      TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'pending',
    notes      TEXT    DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
  );
`;

export const CREATE_PHOTOS_TABLE = `
  CREATE TABLE IF NOT EXISTS survey_photos (
    id          TEXT PRIMARY KEY,
    survey_id   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    label       TEXT DEFAULT '',
    mime_type   TEXT DEFAULT 'image/jpeg',
    captured_at TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
  );
`;

/**
 * Migration statements — run after CREATE TABLE so that existing databases
 * (created before the solarpro columns were added) gain the new columns.
 * SQLite does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN, so we
 * let the "duplicate column name" error be caught and swallowed by the
 * useDatabase init loop (which already handles this case).
 */
export const MIGRATE_SURVEYS_SOLARPRO_COLUMNS = [
  `ALTER TABLE surveys ADD COLUMN solarpro_user_id    TEXT`,
  `ALTER TABLE surveys ADD COLUMN solarpro_project_id TEXT`,
  `ALTER TABLE surveys ADD COLUMN solarpro_email      TEXT`,
  `ALTER TABLE surveys ADD COLUMN solarpro_org_id     TEXT`,
];

/** Run once at app startup to ensure all tables exist. */
export const INIT_STATEMENTS = [
  'PRAGMA journal_mode = WAL;',
  'PRAGMA foreign_keys = ON;',
  CREATE_SURVEYS_TABLE,
  CREATE_CHECKLIST_TABLE,
  CREATE_PHOTOS_TABLE,
  ...MIGRATE_SURVEYS_SOLARPRO_COLUMNS,
];