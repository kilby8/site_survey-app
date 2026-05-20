import { randomUUID } from "crypto";
import { pool } from "../database";
import { deleteFile } from "../utils/storageClient";

type Stage = "a" | "b";

type Options = {
  stage: Stage;
  apply: boolean;
  limit: number;
  holdDaysA: number;
  holdDaysB: number;
};

export type PhotoRetentionRunSummary = {
  runId: string;
  stage: Stage;
  apply: boolean;
  limit: number;
  holdDaysA: number;
  holdDaysB: number;
  candidateRows: number;
  estimatedBlobBytes: number;
};

type CandidateRow = {
  photo_id: string;
  survey_id: string;
  file_path: string | null;
  data_url_bytes: number;
  photo_data_bytes: number;
  solarpro_synced_at: string;
};

function parseIntegerArg(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number.parseInt(raw.slice(name.length + 3), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseStageArg(): Stage {
  const raw = process.argv.find((arg) => arg.startsWith("--stage="));
  const stage = raw?.slice("--stage=".length).toLowerCase();
  return stage === "b" ? "b" : "a";
}

function parseOptions(): Options {
  return {
    stage: parseStageArg(),
    apply: process.argv.includes("--apply"),
    limit: parseIntegerArg("limit", 200),
    holdDaysA: parseIntegerArg("hold-days-a", 7),
    holdDaysB: parseIntegerArg("hold-days-b", 30),
  };
}

async function ensureRetentionSchema(): Promise<void> {
  await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS solarpro_synced_at TIMESTAMPTZ`);

  await pool.query(`
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
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_photo_purge_audit_run_id ON photo_purge_audit (run_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_photo_purge_audit_created_at ON photo_purge_audit (created_at DESC)`);
}

async function loadCandidates(options: Options): Promise<CandidateRow[]> {
  if (options.stage === "a") {
    const { rows } = await pool.query<CandidateRow>(
      `SELECT
         p.id::text AS photo_id,
         p.survey_id::text AS survey_id,
         p.file_path,
         COALESCE(octet_length(p.data_url), 0) AS data_url_bytes,
         COALESCE(octet_length(p.photo_data), 0) AS photo_data_bytes,
         s.solarpro_synced_at::text
       FROM survey_photos p
       INNER JOIN surveys s ON s.id = p.survey_id
       WHERE s.solarpro_synced_at IS NOT NULL
         AND s.solarpro_synced_at <= NOW() - (($1::int)::text || ' days')::interval
         AND (p.data_url IS NOT NULL OR p.photo_data IS NOT NULL)
       ORDER BY s.solarpro_synced_at ASC, p.created_at ASC
       LIMIT $2`,
      [options.holdDaysA, options.limit],
    );
    return rows;
  }

  const { rows } = await pool.query<CandidateRow>(
    `SELECT
       p.id::text AS photo_id,
       p.survey_id::text AS survey_id,
       p.file_path,
       COALESCE(octet_length(p.data_url), 0) AS data_url_bytes,
       COALESCE(octet_length(p.photo_data), 0) AS photo_data_bytes,
       s.solarpro_synced_at::text
     FROM survey_photos p
     INNER JOIN surveys s ON s.id = p.survey_id
     WHERE s.solarpro_synced_at IS NOT NULL
       AND s.solarpro_synced_at <= NOW() - (($1::int)::text || ' days')::interval
       AND p.file_path IS NOT NULL
       AND p.data_url IS NULL
       AND p.photo_data IS NULL
     ORDER BY s.solarpro_synced_at ASC, p.created_at ASC
     LIMIT $2`,
    [options.holdDaysB, options.limit],
  );
  return rows;
}

async function writeAudit(params: {
  runId: string;
  row: CandidateRow;
  stage: Stage;
  action: string;
  dryRun: boolean;
  status: string;
  bytesBefore: number;
  bytesAfter: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO photo_purge_audit
      (run_id, photo_id, survey_id, stage, action, dry_run, status, bytes_before, bytes_after, details)
     VALUES
      ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      params.runId,
      params.row.photo_id,
      params.row.survey_id,
      params.stage,
      params.action,
      params.dryRun,
      params.status,
      params.bytesBefore,
      params.bytesAfter,
      JSON.stringify(params.details ?? {}),
    ],
  );
}

async function applyStageA(runId: string, rows: CandidateRow[], apply: boolean): Promise<void> {
  for (const row of rows) {
    const bytesBefore = row.data_url_bytes + row.photo_data_bytes;
    if (!apply) {
      await writeAudit({
        runId,
        row,
        stage: "a",
        action: "clear_blob_columns",
        dryRun: true,
        status: "planned",
        bytesBefore,
        bytesAfter: 0,
      });
      continue;
    }

    await pool.query(
      `UPDATE survey_photos
          SET data_url = NULL,
              photo_data = NULL
        WHERE id = $1::uuid`,
      [row.photo_id],
    );

    await writeAudit({
      runId,
      row,
      stage: "a",
      action: "clear_blob_columns",
      dryRun: false,
      status: "applied",
      bytesBefore,
      bytesAfter: 0,
    });
  }
}

async function applyStageB(runId: string, rows: CandidateRow[], apply: boolean): Promise<void> {
  for (const row of rows) {
    if (!row.file_path) continue;

    if (!apply) {
      await writeAudit({
        runId,
        row,
        stage: "b",
        action: "delete_storage_file",
        dryRun: true,
        status: "planned",
        bytesBefore: 0,
        bytesAfter: 0,
        details: { file_path: row.file_path },
      });
      continue;
    }

    try {
      await deleteFile(row.file_path);
      await pool.query(
        `UPDATE survey_photos
            SET file_path = NULL
          WHERE id = $1::uuid`,
        [row.photo_id],
      );

      await writeAudit({
        runId,
        row,
        stage: "b",
        action: "delete_storage_file",
        dryRun: false,
        status: "applied",
        bytesBefore: 0,
        bytesAfter: 0,
        details: { deleted_file_path: row.file_path },
      });
    } catch (error) {
      await writeAudit({
        runId,
        row,
        stage: "b",
        action: "delete_storage_file",
        dryRun: false,
        status: "failed",
        bytesBefore: 0,
        bytesAfter: 0,
        details: {
          file_path: row.file_path,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}

export async function runPhotoRetentionPurge(options: Options): Promise<PhotoRetentionRunSummary> {
  const runId = randomUUID();

  await ensureRetentionSchema();

  const rows = await loadCandidates(options);
  const totalBlobBytes = rows.reduce(
    (sum, row) => sum + row.data_url_bytes + row.photo_data_bytes,
    0,
  );

  if (options.stage === "a") {
    await applyStageA(runId, rows, options.apply);
  } else {
    await applyStageB(runId, rows, options.apply);
  }

  return {
    runId,
    stage: options.stage,
    apply: options.apply,
    limit: options.limit,
    holdDaysA: options.holdDaysA,
    holdDaysB: options.holdDaysB,
    candidateRows: rows.length,
    estimatedBlobBytes: totalBlobBytes,
  };
}

async function main(): Promise<void> {
  const options = parseOptions();
  const result = await runPhotoRetentionPurge(options);

  console.info(
    JSON.stringify(
      {
        type: "photo_retention_purge_run",
        run_id: result.runId,
        stage: result.stage,
        apply: result.apply,
        limit: result.limit,
        hold_days_a: result.holdDaysA,
        hold_days_b: result.holdDaysB,
        candidate_rows: result.candidateRows,
        estimated_blob_bytes: result.estimatedBlobBytes,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("photoRetentionPurge failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

