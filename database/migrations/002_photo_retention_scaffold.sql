-- Add SolarPro sync marker and purge audit table for zero-risk photo retention rollout.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS solarpro_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_surveys_solarpro_synced_at
  ON surveys (solarpro_synced_at DESC)
  WHERE solarpro_synced_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS photo_purge_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  photo_id UUID NOT NULL REFERENCES survey_photos(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('a', 'b')),
  action TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL,
  bytes_before BIGINT NOT NULL DEFAULT 0,
  bytes_after BIGINT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_purge_audit_run_id
  ON photo_purge_audit (run_id);

CREATE INDEX IF NOT EXISTS idx_photo_purge_audit_created_at
  ON photo_purge_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_photo_purge_audit_stage_status
  ON photo_purge_audit (stage, status);

