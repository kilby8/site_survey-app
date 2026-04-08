-- ============================================================
-- Site Survey App — PostgreSQL / PostGIS Database Schema
-- ============================================================
-- Run with:  psql -U survey_user -d site_survey -f schema.sql
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ----------------------------------------------------------------
-- 1. CATEGORIES
--    Pre-defined and user-created survey category types
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color       VARCHAR(7)   DEFAULT '#1a56db',  -- hex color for UI badges
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed default categories
INSERT INTO categories (name, description, color) VALUES
  ('Electrical',          'Electrical systems and infrastructure',        '#f59e0b'),
  ('Structural',          'Structural integrity and civil works',         '#ef4444'),
  ('Network/Comms',       'Network, fibre and communications',            '#8b5cf6'),
  ('Environmental',       'Environmental and compliance checks',          '#10b981'),
  ('Safety',              'Health & safety site inspections',             '#f97316'),
  ('General Inspection',  'General site survey and walkthrough',          '#1a56db'),
  -- Solar installation categories
  ('Ground Mount',        'Solar panel ground mount installations',       '#16a34a'),
  ('Roof Mount',          'Rooftop solar panel mount installations',      '#7c3aed'),
  ('Solar Fencing',       'Solar fence / agrivoltaic installations',      '#0891b2')
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------
-- 2. PROJECTS
--    Top-level grouping for surveys
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  client      VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 2b. USERS
--     Authentication accounts for dashboard access
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- ----------------------------------------------------------------
-- 3. SURVEYS
--    Core survey record — one row per site visit
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS surveys (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID         REFERENCES projects(id) ON DELETE SET NULL,
  project_name    VARCHAR(255) NOT NULL,
  category_id     UUID         REFERENCES categories(id) ON DELETE SET NULL,
  category_name   VARCHAR(100),
  inspector_name  VARCHAR(255) NOT NULL,
  site_name       VARCHAR(255) NOT NULL,
  site_address    TEXT,
  -- Spatial column — WGS-84 geographic point (lon, lat)
  location        GEOGRAPHY(POINT, 4326),
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  gps_accuracy    DOUBLE PRECISION,
  survey_date     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  notes           TEXT,
  status          VARCHAR(50)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'synced')),
  -- offline support: track which device originated the record
  device_id       VARCHAR(255),
  synced_at       TIMESTAMPTZ,
  -- Category-specific survey fields (Ground Mount / Roof Mount / Solar Fencing)
  -- Stored as JSONB so the design team can query individual fields via ->>'field'
  metadata        JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Spatial index for fast geographic queries
CREATE INDEX IF NOT EXISTS surveys_location_idx
  ON surveys USING GIST (location);

-- Regular indexes for common filters
CREATE INDEX IF NOT EXISTS surveys_project_id_idx   ON surveys (project_id);
CREATE INDEX IF NOT EXISTS surveys_status_idx       ON surveys (status);
CREATE INDEX IF NOT EXISTS surveys_survey_date_idx  ON surveys (survey_date DESC);

-- ----------------------------------------------------------------
-- 4. CHECKLIST_ITEMS
--    Pass / Fail / N-A items linked to a survey
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  label       VARCHAR(255) NOT NULL,
  status      VARCHAR(50)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pass', 'fail', 'n/a', 'pending')),
  notes       TEXT,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checklist_survey_id_idx ON checklist_items (survey_id);

-- ----------------------------------------------------------------
-- 5. SURVEY_PHOTOS
--    Photos captured during a survey (stored as base64 or file path)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS survey_photos (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  filename    VARCHAR(255),
  label       VARCHAR(255),
  data_url    TEXT,           -- base64 data URI (mobile offline upload)
  file_path   VARCHAR(512),   -- server file path (after server-side storage)
  mime_type   VARCHAR(100)    DEFAULT 'image/jpeg',
  captured_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS photos_survey_id_idx ON survey_photos (survey_id);

-- ----------------------------------------------------------------
-- 6. SYNC_QUEUE
--    Tracks offline-originated records waiting to be reconciled
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
  id          SERIAL       PRIMARY KEY,
  device_id   VARCHAR(255) NOT NULL,
  survey_id   UUID         REFERENCES surveys(id) ON DELETE CASCADE,
  action      VARCHAR(50)  NOT NULL CHECK (action IN ('create', 'update')),
  payload     JSONB        NOT NULL,
  status      VARCHAR(50)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_msg   TEXT,
  queued_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sync_queue_status_idx    ON sync_queue (status);
CREATE INDEX IF NOT EXISTS sync_queue_device_id_idx ON sync_queue (device_id);

-- ----------------------------------------------------------------
-- 7. AR_DETECTIONS
--    Stores structured object-detection payloads submitted by the
--    mobile app after an AR inspection session.
--    The `electrical` column is a JSONB array of detected items,
--    each carrying a ByteTracker-assigned `track_id` that remains
--    stable across frames so the AR tag stays anchored to the same
--    physical object (MSP, meter, etc.).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ar_detections (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  project_id   VARCHAR(255),
  -- Array of { class, confidence, track_id, depth_m?, ar_label? }
  electrical   JSONB        NOT NULL DEFAULT '[]',
  -- Structural/exterior detections: roof, conduit, weatherhead, etc.
  exterior     JSONB        NOT NULL DEFAULT '[]',
  -- Depth-anchored spatial distances from the AR Depth Estimation model
  distances    JSONB        NOT NULL DEFAULT '{}',
  -- Free-form key/value measurements: e.g. { "meter_to_panel_distance": "1.5m" }
  measurements JSONB        NOT NULL DEFAULT '{}',
  -- Flat integer array of all active ByteTracker IDs in the session
  -- (union of electrical + exterior track_ids for fast lookup)
  track_ids    JSONB        NOT NULL DEFAULT '[]',
  roof_type    VARCHAR(100),
  detected_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ar_detections_survey_id_idx ON ar_detections (survey_id);
CREATE INDEX IF NOT EXISTS ar_detections_detected_at_idx ON ar_detections (detected_at DESC);

-- ----------------------------------------------------------------
-- 8. PHOTO_INFERENCE_LOGS
--    Stores raw/normalized model outputs for monitoring and retraining.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photo_inference_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id       UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  photo_id        UUID         NOT NULL REFERENCES survey_photos(id) ON DELETE CASCADE,
  model_id        VARCHAR(255),
  request_options JSONB        NOT NULL DEFAULT '{}',
  inference       JSONB        NOT NULL,
  prediction_count INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS photo_inference_logs_survey_id_idx
  ON photo_inference_logs (survey_id);
CREATE INDEX IF NOT EXISTS photo_inference_logs_photo_id_idx
  ON photo_inference_logs (photo_id);
CREATE INDEX IF NOT EXISTS photo_inference_logs_created_at_idx
  ON photo_inference_logs (created_at DESC);

-- ----------------------------------------------------------------
-- 9. Automatic updated_at trigger
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'surveys_set_updated_at'
  ) THEN
    CREATE TRIGGER surveys_set_updated_at
      BEFORE UPDATE ON surveys
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'projects_set_updated_at'
  ) THEN
    CREATE TRIGGER projects_set_updated_at
      BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'users_set_updated_at'
  ) THEN
    CREATE TRIGGER users_set_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
