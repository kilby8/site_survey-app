import { pool } from "../database";

interface SurveyRow {
  id: string;
  project_id: string | null;
  project_name: string;
  category_id: string | null;
  category_name: string | null;
  inspector_name: string;
  site_name: string;
  site_address: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy: number | null;
  survey_date: string;
  notes: string | null;
  status: string;
  device_id: string | null;
  metadata: unknown;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

let workerHandle: NodeJS.Timeout | null = null;
let checkpointReady: Promise<void> | null = null;
let running = false;
let sqlServerModule: any | null = null;
let sqlServerPoolPromise: Promise<any> | null = null;

const CHECKPOINT_TARGET = "sqlserver";
const CHECKPOINT_EPOCH = "1970-01-01T00:00:00.000Z";

function isEnabled(): boolean {
  return (process.env.SQLSERVER_SYNC_ENABLED || "false").toLowerCase() === "true";
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) return defaultValue;
  return raw.toLowerCase() === "true";
}

function getSqlServerModule(): any {
  if (!sqlServerModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sqlServerModule = require("mssql");
  }
  return sqlServerModule;
}

async function getSqlServerPool(): Promise<any> {
  if (sqlServerPoolPromise) return sqlServerPoolPromise;

  const mssql = getSqlServerModule();
  const config = {
    server: process.env.SQLSERVER_HOST,
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    database: process.env.SQLSERVER_DATABASE,
    port: Number.parseInt(process.env.SQLSERVER_PORT || "1433", 10),
    options: {
      encrypt: parseBoolean(process.env.SQLSERVER_ENCRYPT, true),
      trustServerCertificate: parseBoolean(
        process.env.SQLSERVER_TRUST_CERT,
        true,
      ),
    },
  };

  sqlServerPoolPromise = mssql
    .connect(config)
    .then((connectedPool: any) => connectedPool)
    .catch((error: unknown) => {
      sqlServerPoolPromise = null;
      throw error;
    });

  return sqlServerPoolPromise;
}

async function ensureCheckpointTable(): Promise<void> {
  if (!checkpointReady) {
    checkpointReady = pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS external_sync_state (
          target TEXT PRIMARY KEY,
          last_synced_at TIMESTAMPTZ NOT NULL DEFAULT '${CHECKPOINT_EPOCH}'::timestamptz,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      )
      .then(() => undefined)
      .catch((error) => {
        checkpointReady = null;
        throw error;
      });
  }

  await checkpointReady;
}

async function ensureCheckpointRow(): Promise<void> {
  await ensureCheckpointTable();

  await pool.query(
    `INSERT INTO external_sync_state (target, last_synced_at)
     VALUES ($1, $2::timestamptz)
     ON CONFLICT (target) DO NOTHING`,
    [CHECKPOINT_TARGET, CHECKPOINT_EPOCH],
  );
}

async function getCheckpoint(): Promise<string> {
  await ensureCheckpointRow();

  const { rows } = await pool.query<{ last_synced_at: string }>(
    `SELECT last_synced_at::text AS last_synced_at
       FROM external_sync_state
      WHERE target = $1
      LIMIT 1`,
    [CHECKPOINT_TARGET],
  );

  return rows[0]?.last_synced_at || CHECKPOINT_EPOCH;
}

async function setCheckpoint(isoTimestamp: string): Promise<void> {
  await ensureCheckpointRow();

  await pool.query(
    `UPDATE external_sync_state
        SET last_synced_at = $2::timestamptz,
            updated_at = NOW()
      WHERE target = $1`,
    [CHECKPOINT_TARGET, isoTimestamp],
  );
}

async function ensureSqlServerTables(sqlPool: any): Promise<void> {
  await sqlPool.request().query(`
IF OBJECT_ID('dbo.ss_surveys', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ss_surveys (
    id NVARCHAR(36) PRIMARY KEY,
    project_id NVARCHAR(36) NULL,
    project_name NVARCHAR(255) NOT NULL,
    category_id NVARCHAR(36) NULL,
    category_name NVARCHAR(100) NULL,
    inspector_name NVARCHAR(255) NOT NULL,
    site_name NVARCHAR(255) NOT NULL,
    site_address NVARCHAR(MAX) NULL,
    latitude FLOAT NULL,
    longitude FLOAT NULL,
    gps_accuracy FLOAT NULL,
    survey_date DATETIME2 NOT NULL,
    notes NVARCHAR(MAX) NULL,
    status NVARCHAR(50) NOT NULL,
    device_id NVARCHAR(255) NULL,
    metadata NVARCHAR(MAX) NULL,
    synced_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    deleted_at DATETIME2 NULL
  )
END
`);

  await sqlPool.request().query(`
IF OBJECT_ID('dbo.ss_checklist_items', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ss_checklist_items (
    id NVARCHAR(36) PRIMARY KEY,
    survey_id NVARCHAR(36) NOT NULL,
    label NVARCHAR(255) NOT NULL,
    status NVARCHAR(50) NOT NULL,
    notes NVARCHAR(MAX) NULL,
    sort_order INT NOT NULL,
    created_at DATETIME2 NOT NULL
  )
END
`);

  await sqlPool.request().query(`
IF OBJECT_ID('dbo.ss_survey_photos', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ss_survey_photos (
    id NVARCHAR(36) PRIMARY KEY,
    survey_id NVARCHAR(36) NOT NULL,
    filename NVARCHAR(255) NULL,
    label NVARCHAR(255) NULL,
    file_path NVARCHAR(MAX) NULL,
    mime_type NVARCHAR(100) NULL,
    captured_at DATETIME2 NOT NULL,
    created_at DATETIME2 NOT NULL
  )
END
`);

  await sqlPool.request().query(`
IF OBJECT_ID('dbo.ss_ar_detections', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ss_ar_detections (
    id NVARCHAR(36) PRIMARY KEY,
    survey_id NVARCHAR(36) NOT NULL,
    project_id NVARCHAR(255) NULL,
    electrical NVARCHAR(MAX) NOT NULL,
    exterior NVARCHAR(MAX) NOT NULL,
    distances NVARCHAR(MAX) NOT NULL,
    measurements NVARCHAR(MAX) NOT NULL,
    track_ids NVARCHAR(MAX) NOT NULL,
    roof_type NVARCHAR(100) NULL,
    detected_at DATETIME2 NOT NULL,
    created_at DATETIME2 NOT NULL
  )
END
`);
}

async function fetchSurveyChildren(surveyId: string) {
  const [checklistRows, photoRows, detectionRows] = await Promise.all([
    pool.query(
      `SELECT id::text, survey_id::text, label, status, notes, sort_order, created_at
         FROM checklist_items
        WHERE survey_id = $1`,
      [surveyId],
    ),
    pool.query(
      `SELECT id::text, survey_id::text, filename, label, file_path, mime_type, captured_at, created_at
         FROM survey_photos
        WHERE survey_id = $1`,
      [surveyId],
    ),
    pool.query(
      `SELECT id::text, survey_id::text, project_id,
              electrical::text, exterior::text, distances::text,
              measurements::text, track_ids::text, roof_type,
              detected_at, created_at
         FROM ar_detections
        WHERE survey_id = $1`,
      [surveyId],
    ),
  ]);

  return {
    checklist: checklistRows.rows,
    photos: photoRows.rows,
    detections: detectionRows.rows,
  };
}

async function upsertSurvey(sqlPool: any, survey: SurveyRow): Promise<void> {
  await sqlPool
    .request()
    .input("id", survey.id)
    .input("project_id", survey.project_id)
    .input("project_name", survey.project_name)
    .input("category_id", survey.category_id)
    .input("category_name", survey.category_name)
    .input("inspector_name", survey.inspector_name)
    .input("site_name", survey.site_name)
    .input("site_address", survey.site_address)
    .input("latitude", survey.latitude)
    .input("longitude", survey.longitude)
    .input("gps_accuracy", survey.gps_accuracy)
    .input("survey_date", survey.survey_date)
    .input("notes", survey.notes)
    .input("status", survey.status)
    .input("device_id", survey.device_id)
    .input("metadata", survey.metadata != null ? JSON.stringify(survey.metadata) : null)
    .input("synced_at", survey.synced_at)
    .input("created_at", survey.created_at)
    .input("updated_at", survey.updated_at)
    .input("deleted_at", survey.deleted_at)
    .query(`
IF EXISTS (SELECT 1 FROM dbo.ss_surveys WHERE id = @id)
BEGIN
  UPDATE dbo.ss_surveys
     SET project_id = @project_id,
         project_name = @project_name,
         category_id = @category_id,
         category_name = @category_name,
         inspector_name = @inspector_name,
         site_name = @site_name,
         site_address = @site_address,
         latitude = @latitude,
         longitude = @longitude,
         gps_accuracy = @gps_accuracy,
         survey_date = @survey_date,
         notes = @notes,
         status = @status,
         device_id = @device_id,
         metadata = @metadata,
         synced_at = @synced_at,
         created_at = @created_at,
         updated_at = @updated_at,
         deleted_at = @deleted_at
   WHERE id = @id
END
ELSE
BEGIN
  INSERT INTO dbo.ss_surveys (
    id, project_id, project_name, category_id, category_name,
    inspector_name, site_name, site_address,
    latitude, longitude, gps_accuracy,
    survey_date, notes, status, device_id, metadata,
    synced_at, created_at, updated_at, deleted_at
  ) VALUES (
    @id, @project_id, @project_name, @category_id, @category_name,
    @inspector_name, @site_name, @site_address,
    @latitude, @longitude, @gps_accuracy,
    @survey_date, @notes, @status, @device_id, @metadata,
    @synced_at, @created_at, @updated_at, @deleted_at
  )
END
`);
}

async function replaceChecklist(sqlPool: any, surveyId: string, rows: any[]): Promise<void> {
  await sqlPool.request().input("survey_id", surveyId).query(
    `DELETE FROM dbo.ss_checklist_items WHERE survey_id = @survey_id`,
  );

  for (const row of rows) {
    await sqlPool
      .request()
      .input("id", row.id)
      .input("survey_id", row.survey_id)
      .input("label", row.label)
      .input("status", row.status)
      .input("notes", row.notes)
      .input("sort_order", Number(row.sort_order) || 0)
      .input("created_at", row.created_at)
      .query(`
INSERT INTO dbo.ss_checklist_items
  (id, survey_id, label, status, notes, sort_order, created_at)
VALUES
  (@id, @survey_id, @label, @status, @notes, @sort_order, @created_at)
`);
  }
}

async function replacePhotos(sqlPool: any, surveyId: string, rows: any[]): Promise<void> {
  await sqlPool.request().input("survey_id", surveyId).query(
    `DELETE FROM dbo.ss_survey_photos WHERE survey_id = @survey_id`,
  );

  for (const row of rows) {
    await sqlPool
      .request()
      .input("id", row.id)
      .input("survey_id", row.survey_id)
      .input("filename", row.filename)
      .input("label", row.label)
      .input("file_path", row.file_path)
      .input("mime_type", row.mime_type)
      .input("captured_at", row.captured_at)
      .input("created_at", row.created_at)
      .query(`
INSERT INTO dbo.ss_survey_photos
  (id, survey_id, filename, label, file_path, mime_type, captured_at, created_at)
VALUES
  (@id, @survey_id, @filename, @label, @file_path, @mime_type, @captured_at, @created_at)
`);
  }
}

async function replaceDetections(sqlPool: any, surveyId: string, rows: any[]): Promise<void> {
  await sqlPool.request().input("survey_id", surveyId).query(
    `DELETE FROM dbo.ss_ar_detections WHERE survey_id = @survey_id`,
  );

  for (const row of rows) {
    await sqlPool
      .request()
      .input("id", row.id)
      .input("survey_id", row.survey_id)
      .input("project_id", row.project_id)
      .input("electrical", row.electrical || "[]")
      .input("exterior", row.exterior || "[]")
      .input("distances", row.distances || "{}")
      .input("measurements", row.measurements || "{}")
      .input("track_ids", row.track_ids || "[]")
      .input("roof_type", row.roof_type)
      .input("detected_at", row.detected_at)
      .input("created_at", row.created_at)
      .query(`
INSERT INTO dbo.ss_ar_detections
  (id, survey_id, project_id, electrical, exterior, distances,
   measurements, track_ids, roof_type, detected_at, created_at)
VALUES
  (@id, @survey_id, @project_id, @electrical, @exterior, @distances,
   @measurements, @track_ids, @roof_type, @detected_at, @created_at)
`);
  }
}

export async function processSqlServerSync(limit = 50): Promise<void> {
  if (!isEnabled()) return;
  if (running) return;
  running = true;

  try {
    const checkpoint = await getCheckpoint();

    const { rows } = await pool.query<SurveyRow>(
      `SELECT
         id::text,
         project_id::text,
         project_name,
         category_id::text,
         category_name,
         inspector_name,
         site_name,
         site_address,
         latitude,
         longitude,
         gps_accuracy,
         survey_date::text,
         notes,
         status,
         device_id,
         metadata,
         synced_at::text,
         created_at::text,
         updated_at::text,
         deleted_at::text
       FROM surveys
      WHERE updated_at > $1::timestamptz
      ORDER BY updated_at ASC
      LIMIT $2`,
      [checkpoint, limit],
    );

    if (rows.length === 0) return;

    const sqlPool = await getSqlServerPool();
    await ensureSqlServerTables(sqlPool);

    let maxUpdatedAt = checkpoint;

    for (const survey of rows) {
      const children = await fetchSurveyChildren(survey.id);
      await upsertSurvey(sqlPool, survey);
      await replaceChecklist(sqlPool, survey.id, children.checklist);
      await replacePhotos(sqlPool, survey.id, children.photos);
      await replaceDetections(sqlPool, survey.id, children.detections);

      if (new Date(survey.updated_at).getTime() > new Date(maxUpdatedAt).getTime()) {
        maxUpdatedAt = survey.updated_at;
      }
    }

    await setCheckpoint(maxUpdatedAt);

    console.info(
      JSON.stringify({
        type: "sqlserver_sync",
        synced: rows.length,
        checkpoint: maxUpdatedAt,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("SQL Server sync failed:", message);
  } finally {
    running = false;
  }
}

export function startSqlServerSyncWorker(intervalMs = 60_000): void {
  if (!isEnabled()) return;
  if (workerHandle) return;

  workerHandle = setInterval(() => {
    processSqlServerSync().catch((error) => {
      console.error("SQL Server sync worker error:", error);
    });
  }, intervalMs);
}

export function stopSqlServerSyncWorker(): void {
  if (!workerHandle) return;
  clearInterval(workerHandle);
  workerHandle = null;
}
