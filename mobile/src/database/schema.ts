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
 * Migration metadata for existing databases.
 * Runtime migration code checks PRAGMA table_info(surveys) and only runs the
 * plain ALTER TABLE statements for columns that are actually missing.
 */
export const SURVEYS_OPTIONAL_COLUMNS = [
  { name: 'project_id', sqlType: 'TEXT' },
  { name: 'solarpro_user_id', sqlType: 'TEXT' },
  { name: 'solarpro_project_id', sqlType: 'TEXT' },
  { name: 'solarpro_email', sqlType: 'TEXT' },
  { name: 'solarpro_org_id', sqlType: 'TEXT' },
  // v2 structured surveys (src/survey). A row with doc IS NULL is a legacy survey.
  { name: 'doc', sqlType: 'TEXT' },
  { name: 'current_step', sqlType: 'TEXT' },
  { name: 'owner_email', sqlType: 'TEXT' },
  { name: 'sync_attempts', sqlType: 'INTEGER DEFAULT 0' },
  { name: 'next_retry_at', sqlType: 'TEXT' },
  { name: 'server_posted', sqlType: 'INTEGER DEFAULT 0' },
  { name: 'submitted_at', sqlType: 'TEXT' },
] as const;

/** v2 Golden Block columns on survey_photos. Legacy rows leave them NULL. */
export const PHOTOS_OPTIONAL_COLUMNS = [
  { name: 'rel_path', sqlType: 'TEXT' },
  { name: 'annotated_rel_path', sqlType: 'TEXT' },
  { name: 'step_id', sqlType: 'TEXT' },
  { name: 'section_id', sqlType: 'TEXT' },
  { name: 'slot_id', sqlType: 'TEXT' },
  { name: 'plane_id', sqlType: 'TEXT' },
  { name: 'required', sqlType: 'INTEGER DEFAULT 0' },
  { name: 'capture_order', sqlType: 'INTEGER DEFAULT 0' },
  { name: 'gps_lat', sqlType: 'REAL' },
  { name: 'gps_lng', sqlType: 'REAL' },
  { name: 'gps_alt', sqlType: 'REAL' },
  { name: 'heading', sqlType: 'REAL' },
  { name: 'notes', sqlType: 'TEXT' },
  { name: 'retake_reason', sqlType: 'TEXT' },
  { name: 'quality_status', sqlType: 'TEXT' },
  { name: 'blur_score', sqlType: 'REAL' },
  { name: 'quality_flags', sqlType: 'TEXT' },
  { name: 'ahash', sqlType: 'TEXT' },
  { name: 'markup_json', sqlType: 'TEXT' },
  { name: 'upload_state', sqlType: "TEXT DEFAULT 'local'" },
  { name: 'server_photo_id', sqlType: 'TEXT' },
] as const;

/** Run once at app startup to ensure all tables exist. */
export const INIT_STATEMENTS = [
  'PRAGMA journal_mode = WAL;',
  'PRAGMA foreign_keys = ON;',
  CREATE_SURVEYS_TABLE,
  CREATE_CHECKLIST_TABLE,
  CREATE_PHOTOS_TABLE,
];