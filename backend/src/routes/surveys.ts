/**
 * backend/src/routes/surveys.ts
 *
 * All survey-related API endpoints.
 * Uses pool.query from the shared database module throughout.
 * Location is stored as GEOGRAPHY(POINT, 4326) via PostGIS.
 */
import path from "path";
import { Router, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../database";
import { solarSurveySchema } from "../models/Survey";
import { stringify as csvStringify } from "csv-stringify/sync";
import { generateReport, toMarkdown } from "../utils/reportGenerator";
import { deleteFile, uploadFile } from "../utils/storageClient";
import {
  enqueueSurveyCompleteWebhook,
  ensureWebhookDeliveriesTable,
  processWebhookQueue,
  softDeleteSurveyAndQueueCleanup,
} from "../services/webhookService";
import {
  incrementMetric,
  recordTiming,
} from "../services/metrics";
import { syncSurveyDeletionToSqlServer } from "../services/sqlServerSyncService";

let surveysSoftDeleteReady: Promise<void> | null = null;

async function ensureSurveySoftDeleteColumn(): Promise<void> {
  if (!surveysSoftDeleteReady) {
    surveysSoftDeleteReady = (async () => {
      try {
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS project_id UUID`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS category_id UUID`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS category_name VARCHAR(100)`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS metadata JSONB`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS solarpro_user_id TEXT`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS solarpro_project_id TEXT`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS solarpro_email TEXT`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS solarpro_org_id TEXT`);
        await pool.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS inspector_email TEXT`);
        await pool.query(`ALTER TABLE survey_photos ADD COLUMN IF NOT EXISTS photo_data BYTEA`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_surveys_solarpro_user_id ON surveys(solarpro_user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_surveys_solarpro_project_id ON surveys(solarpro_project_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_surveys_active_updated_at ON surveys(deleted_at, updated_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_surveys_active_survey_date ON surveys(deleted_at, survey_date DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_surveys_active_project_status ON surveys(deleted_at, project_id, status)`);
      } catch (error) {
        console.warn("survey schema migration skipped:", error);
      }
    })().catch((error) => {
      surveysSoftDeleteReady = null;
      throw error;
    });
  }

  await surveysSoftDeleteReady;
}

const router = Router();

const ADMIN_EMAIL_OVERRIDES = new Set(["carpenterjames88@gmail.com", "carpj88@outlook.com"]);

function cleanEmail(email?: string): string {
  return (email || "").trim().toLowerCase();
}

const uuidV4Schema = z.string().uuid();

function isValidUuid(value: string): boolean {
  return uuidV4Schema.safeParse(value).success;
}

function normalizeOptionalUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isValidUuid(trimmed) ? trimmed : null;
}

function normalizeCategoryName(
  categoryId: unknown,
  categoryName: unknown,
): string | null {
  if (typeof categoryName === "string" && categoryName.trim()) {
    return categoryName.trim();
  }
  if (typeof categoryId === "string" && categoryId.trim() && !isValidUuid(categoryId.trim())) {
    return categoryId.trim();
  }
  return null;
}

interface Queryable {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

async function resolveExistingProjectId(
  db: Queryable,
  value: unknown,
): Promise<string | null> {
  const candidate = normalizeOptionalUuid(value);
  if (!candidate) return null;

  try {
    const { rows } = await db.query(
      `SELECT 1 FROM projects WHERE id = $1 LIMIT 1`,
      [candidate],
    );

    return rows.length > 0 ? candidate : null;
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === "42P01" || pgError.code === "42501") {
      // projects table missing or inaccessible in this environment
      return null;
    }
    throw error;
  }
}

async function resolveExistingCategoryId(
  db: Queryable,
  value: unknown,
): Promise<string | null> {
  const candidate = normalizeOptionalUuid(value);
  if (!candidate) return null;

  try {
    const { rows } = await db.query(
      `SELECT 1 FROM categories WHERE id = $1 LIMIT 1`,
      [candidate],
    );

    return rows.length > 0 ? candidate : null;
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === "42P01" || pgError.code === "42501") {
      // categories table missing or inaccessible in this environment
      return null;
    }
    throw error;
  }
}

function respondValidationError(
  res: Response,
  message: string,
  field?: string,
): void {
  res.status(422).json({
    error: {
      code: "VALIDATION_FAILED",
      message,
      field,
    },
  });
}

function requireUuidParam(
  req: Request,
  res: Response,
  field: "id" | "photoId",
): boolean {
  const raw = req.params[field];
  if (!raw || !isValidUuid(raw)) {
    respondValidationError(res, `${field} must be a valid UUID`, field);
    return false;
  }
  return true;
}

// ----------------------------------------------------------------
// SSE â€” real-time survey event broadcasting
// ----------------------------------------------------------------
type SseEventType = "survey.created" | "survey.updated" | "survey.deleted";

interface SseClient {
  id: string;
  res: Response;
}

const sseClients: SseClient[] = [];

/** Register a new SSE connection and remove it when the client disconnects. */
function addSseClient(res: Response): SseClient {
  const client: SseClient = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, res };
  sseClients.push(client);
  res.on("close", () => {
    const idx = sseClients.indexOf(client);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
  return client;
}

/** Broadcast a typed event to all connected SSE clients. */
export function broadcastSurveyEvent(type: SseEventType, payload: unknown): void {
  if (sseClients.length === 0) return;
  const data = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.res.write(`event: ${type}\ndata: ${data}\n\n`);
    } catch {
      // Client disconnected mid-write â€” will be cleaned up on "close"
    }
  }
}

// ----------------------------------------------------------------
// Multer â€” memory storage; storageClient handles final destination
// ----------------------------------------------------------------
// Only allow image MIME types
const imageFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per photo
});

// ----------------------------------------------------------------
// TypeScript interfaces
// ----------------------------------------------------------------
interface ChecklistItemInput {
  label: string;
  status: string;
  notes?: string;
  sort_order?: number;
}

interface PhotoInput {
  filename?: string;
  name?: string;       // camelCase alias - mobile sends `name` for the filename
  label?: string;
  data_url?: string;   // base64 - used by mobile sync (snake_case)
  dataUrl?: string;    // base64 - camelCase alias sent by mobile frontend
  mime_type?: string;  // snake_case
  mimeType?: string;   // camelCase alias
  captured_at?: string; // snake_case
  capturedAt?: string;  // camelCase alias
}

/** GeoJSON Point accepted as the `location` field in a request body. */
interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

/**
 * Category-specific metadata stored as JSONB.
 * The `type` discriminator matches the category_id slug so the API
 * and the design team can identify which schema is in use.
 */
interface GroundMountMetadata {
  type: "ground_mount";
  soil_type: "Rocky" | "Sandy" | "Clay" | "Organic/Loam" | null;
  slope_degrees: number | null;
  trenching_path: string;
  vegetation_clearing: boolean;
}
interface RoofMountMetadata {
  type: "roof_mount";
  roof_material: "Asphalt Shingle" | "Metal" | "Tile" | "Membrane" | null;
  rafter_size: "2x4" | "2x6" | "2x8" | null;
  rafter_spacing: "16in" | "24in" | null;
  roof_age_years: number | null;
  azimuth: number | null;
}
interface SolarFencingMetadata {
  type: "solar_fencing";
  perimeter_length_ft: number | null;
  lower_shade_risk: boolean;
  foundation_type: "Driven Piles" | "Concrete Footer" | null;
  bifacial_surface: "Concrete" | "Gravel" | "Grass" | "Dirt" | null;
}
type SurveyMetadata =
  | GroundMountMetadata
  | RoofMountMetadata
  | SolarFencingMetadata;

interface SurveyInput {
  project_name: string;
  project_id?: string;
  category_id?: string;
  category_name?: string;
  inspector_name: string;
  site_name: string;
  site_address?: string;
  /** GeoJSON Point â€” takes priority over latitude/longitude fields */
  location?: GeoJsonPoint;
  latitude?: number;
  longitude?: number;
  gps_accuracy?: number;
  survey_date?: string;
  notes?: string;
  status?: string;
  device_id?: string;
  solarpro_user_id?: string | null;
  solarpro_project_id?: string | null;
  solarpro_email?: string | null;
  solarpro_org_id?: string | null;
  /** Category-specific fields (Ground Mount / Roof Mount / Solar Fencing) */
  metadata?: SurveyMetadata | null;
  checklist?: ChecklistItemInput[];
  photos?: PhotoInput[];
}


function requireAdmin(req: Request, res: Response): boolean {
  const rawEmail = req.authUser?.email;
  const email = cleanEmail(rawEmail);
  const role = req.authUser?.role ?? null;
  const isRoleAdmin = role === "admin";
  const isOverrideAdmin = ADMIN_EMAIL_OVERRIDES.has(email);

  console.info(
    JSON.stringify({
      type: "admin_guard_check",
      route: req.originalUrl,
      method: req.method,
      auth_header_present: Boolean(req.headers.authorization),
      auth_user_present: Boolean(req.authUser),
      auth_user_id: req.authUser?.userId ?? null,
      auth_user_role: role,
      auth_user_email_raw: rawEmail ?? null,
      auth_user_email_normalized: email,
      override_match: isOverrideAdmin,
      allowed: isRoleAdmin || isOverrideAdmin,
    }),
  );

  if (isRoleAdmin || isOverrideAdmin) {
    return true;
  }

  res.status(403).json({ error: "Admin access required" });
  return false;
}

// ----------------------------------------------------------------
// Coordinate helpers
// ----------------------------------------------------------------

/**
 * Extract (lon, lat) from either a GeoJSON Point or explicit lat/lon fields.
 * Returns null when no location data is present.
 */
function extractCoords(
  body: SurveyInput,
): { lon: number; lat: number; accuracy?: number } | null {
  if (
    body.location?.type === "Point" &&
    Array.isArray(body.location.coordinates)
  ) {
    const [lon, lat] = body.location.coordinates;
    return { lon, lat };
  }
  if (body.latitude != null && body.longitude != null) {
    return {
      lon: body.longitude,
      lat: body.latitude,
      accuracy: body.gps_accuracy,
    };
  }
  return null;
}

/**
 * Build the ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography expression
 * and append lon/lat to the params array.
 * Returns the SQL expression string to embed in a query.
 */
function geoExpr(params: unknown[], lon: number, lat: number): string {
  params.push(lon, lat);
  const lonIdx = params.length - 1;
  const latIdx = params.length;
  return `ST_SetSRID(ST_MakePoint($${lonIdx}, $${latIdx}), 4326)::geography`;
}

// ----------------------------------------------------------------
// DB helpers
// ----------------------------------------------------------------

/**
 * Fetch a complete survey (checklist + photos) by ID.
 * Uses ST_AsGeoJSON to serialise the geography point for the response.
 */
async function fetchSurveyFull(id: string) {
  await ensureSurveySoftDeleteColumn();

  let rows: Array<Record<string, unknown>> = [];

  try {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         s.id, s.project_name, s.project_id, s.category_id, s.category_name,
         s.inspector_name, s.inspector_email, s.site_name, s.site_address,
         s.latitude, s.longitude, s.gps_accuracy,
         ST_AsGeoJSON(s.location::geometry)::jsonb AS location_geojson,
         s.survey_date, s.notes, s.status, s.device_id, s.metadata,
         s.solarpro_user_id, s.solarpro_project_id, s.solarpro_email, s.solarpro_org_id,
         s.synced_at, s.created_at, s.updated_at
       FROM surveys s
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [id],
    );
    rows = result.rows;
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    const missingDeletedAt =
      pgError.code === "42703" ||
      (pgError.message ?? "").toLowerCase().includes("deleted_at");

    if (!missingDeletedAt) throw error;

    const fallback = await pool.query<Record<string, unknown>>(
      `SELECT
         s.id, s.project_name, s.project_id, s.category_id, s.category_name,
         s.inspector_name, s.inspector_email, s.site_name, s.site_address,
         s.latitude, s.longitude, s.gps_accuracy,
         ST_AsGeoJSON(s.location::geometry)::jsonb AS location_geojson,
         s.survey_date, s.notes, s.status, s.device_id, s.metadata,
         s.solarpro_user_id, s.solarpro_project_id, s.solarpro_email, s.solarpro_org_id,
         s.synced_at, s.created_at, s.updated_at
       FROM surveys s
       WHERE s.id = $1`,
      [id],
    );

    rows = fallback.rows;
  }

  if (rows.length === 0) return null;
  const survey = rows[0];

  const { rows: checklist } = await pool.query(
    `SELECT id, survey_id, label, status, notes, sort_order, created_at
       FROM checklist_items
      WHERE survey_id = $1
      ORDER BY sort_order, created_at`,
    [id],
  );

  const { rows: photos } = await pool.query(
    `SELECT id, survey_id, filename, label, file_path, mime_type, captured_at, created_at,
            CASE WHEN photo_data IS NOT NULL THEN true ELSE false END as has_photo_data
       FROM survey_photos
      WHERE survey_id = $1
      ORDER BY captured_at`,
    [id],
  );

  return { ...survey, checklist, photos };
}

/** Replace all checklist items for a survey within a transaction client. */
async function upsertChecklist(
  client: import("pg").PoolClient,
  surveyId: string,
  items: ChecklistItemInput[],
): Promise<void> {
  await client.query("DELETE FROM checklist_items WHERE survey_id = $1", [
    surveyId,
  ]);
  for (let i = 0; i < items.length; i++) {
    const { label, status = "pending", notes = "" } = items[i];
    await client.query(
      `INSERT INTO checklist_items (survey_id, label, status, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [surveyId, label, status, notes, i],
    );
  }
}

/** Replace all photos (base64 variant) for a survey within a transaction client.
 *
 * Accepts both snake_case (backend canonical) and camelCase (mobile frontend)
 * field names so either client can call this without a transform layer.
 */
async function upsertPhotos(
  client: import("pg").PoolClient,
  surveyId: string,
  photos: PhotoInput[],
): Promise<void> {
  await client.query("DELETE FROM survey_photos WHERE survey_id = $1", [
    surveyId,
  ]);
  for (const p of photos) {
    // Normalise camelCase fields sent by the mobile frontend to snake_case.
    // Mobile sends: { name, dataUrl, mimeType, capturedAt }
    // Backend expects: { filename, data_url, mime_type, captured_at }
    const rawDataUrl   = p.data_url   ?? p.dataUrl   ?? null;
    const rawMimeType  = p.mime_type  ?? p.mimeType  ?? "image/jpeg";
    const rawFilename  = p.filename   ?? p.name      ?? null;
    const rawCaptured  = p.captured_at ?? p.capturedAt ?? null;

    // If the photo was sent as base64 data_url, persist it to storage
    // (local /uploads/ or S3) and store the resulting path in file_path.
    // This ensures fetchSurveyFull() and extractFilesLegacy() can build a
    // public URL for each photo so SolarPro can ingest them.
    let filePath: string | null = null;
    if (rawDataUrl) {
      try {
        // rawDataUrl may be a bare base64 string or a data URI like
        // "data:image/jpeg;base64,/9j/4AAQ..."
        const mimeType = rawMimeType;
        let base64Data = rawDataUrl;
        const dataUriMatch = rawDataUrl.match(/^data:([^;]+);base64,(.+)$/s);
        if (dataUriMatch) {
          base64Data = dataUriMatch[2];
        }
        const buffer = Buffer.from(base64Data, "base64");
        if (buffer.length > 0) {
          const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
          const filename =
            rawFilename ??
            `${surveyId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          filePath = await uploadFile(buffer, filename, mimeType);
        }
      } catch (uploadErr) {
        // Non-fatal: store data_url only, file_path remains null.
        console.warn(
          `[upsertPhotos] Failed to persist base64 photo to storage for survey ${surveyId}:`,
          uploadErr,
        );
      }
    }

    // Also store raw binary in photo_data for persistent DB-backed serving
    let photoDataBuffer: Buffer | null = null;
    if (rawDataUrl) {
      try {
        let base64Data2 = rawDataUrl;
        const dataUriMatch2 = rawDataUrl.match(/^data:([^;]+);base64,(.+)$/s);
        if (dataUriMatch2) base64Data2 = dataUriMatch2[2];
        const buf2 = Buffer.from(base64Data2, "base64");
        if (buf2.length > 0) photoDataBuffer = buf2;
      } catch { /* non-fatal */ }
    }

    console.info(JSON.stringify({
      type: "upsert_photo",
      survey_id: surveyId,
      filename: rawFilename,
      has_data_url: Boolean(rawDataUrl),
      data_url_length: rawDataUrl?.length ?? 0,
      has_photo_data: Boolean(photoDataBuffer),
      photo_data_bytes: photoDataBuffer?.length ?? 0,
      file_path: filePath,
    }));

    await client.query(
      `INSERT INTO survey_photos
         (survey_id, filename, label, data_url, file_path, mime_type, captured_at, photo_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        surveyId,
        rawFilename,
        p.label ?? null,
        rawDataUrl,
        filePath,
        rawMimeType,
        rawCaptured ? new Date(rawCaptured) : new Date(),
        photoDataBuffer,
      ],
    );
  }
}

/**
 * GET /api/surveys/events
 *
 * Server-Sent Events stream. Clients subscribe once and receive
 * real-time survey.created / survey.updated / survey.deleted events.
 * The connection is kept alive with a 30-second heartbeat comment.
 */
router.get("/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();

  // Send an initial connection-established event
  res.write("event: connected\ndata: {}\n\n");

  addSseClient(res);

  // Heartbeat every 30 s to prevent proxy/load-balancer timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  res.on("close", () => clearInterval(heartbeat));
});

/**
 * POST /api/surveys/validate/solar
 *
 * Validates a solar survey payload against the shared Zod schema.
 * This is intentionally separate from the persisted survey CRUD shape,
 * which stores broader workflow data plus category-specific metadata.
 */
router.post("/validate/solar", async (req: Request, res: Response) => {
  const parsed = solarSurveySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid solar survey payload",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    });
    return;
  }

  res.status(200).json({
    valid: true,
    data: parsed.data,
  });
});

// ================================================================
// EXPORT ROUTES â€” must be declared BEFORE /:id to avoid shadowing
// ================================================================

/**
 * GET /api/surveys/export/geojson
 *
 * Returns a GeoJSON FeatureCollection of all surveys.
 * Supports optional query filters: project_id, status, category_id.
 * Uses ST_AsGeoJSON(location::geometry) so GIS tools can import directly.
 */
router.get("/export/geojson", async (req: Request, res: Response) => {
  try {
    await ensureSurveySoftDeleteColumn();
    const { project_id, status, category_id } = req.query as Record<
      string,
      string
    >;
    const conditions: string[] = ["s.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (project_id) {
      conditions.push(`s.project_id  = $${params.push(project_id)}`);
    }
    if (status) {
      conditions.push(`s.status       = $${params.push(status)}`);
    }
    if (category_id) {
      conditions.push(`s.category_id  = $${params.push(category_id)}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT
         s.id,
         s.project_name,
         s.category_name,
         s.inspector_name,
         s.site_name,
         s.site_address,
         s.latitude,
         s.longitude,
         s.gps_accuracy,
         s.survey_date,
         s.notes,
         s.status,
         s.metadata,
         s.created_at,
         s.updated_at,
         -- ST_AsGeoJSON converts the GEOGRAPHY column to a GeoJSON geometry object
         ST_AsGeoJSON(s.location::geometry)::jsonb AS geometry,
         (
           SELECT json_agg(
             json_build_object(
               'label',  c.label,
               'status', c.status,
               'notes',  c.notes
             ) ORDER BY c.sort_order
           )
           FROM checklist_items c
           WHERE c.survey_id = s.id
         ) AS checklist
       FROM surveys s
       ${where}
       ORDER BY s.survey_date DESC`,
      params,
    );

    const features = rows.map((row) => ({
      type: "Feature" as const,
      geometry: row.geometry ?? null,
      properties: {
        id: row.id,
        project_name: row.project_name,
        category: row.category_name,
        inspector: row.inspector_name,
        site_name: row.site_name,
        site_address: row.site_address,
        latitude: row.latitude,
        longitude: row.longitude,
        gps_accuracy_m: row.gps_accuracy,
        survey_date: row.survey_date,
        status: row.status,
        notes: row.notes,
        /** Category-specific metadata â€” Ground Mount, Roof Mount, or Solar Fencing fields */
        metadata: row.metadata ?? null,
        checklist: row.checklist ?? [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    }));

    const geojson = {
      type: "FeatureCollection" as const,
      features,
      metadata: {
        exported_at: new Date().toISOString(),
        total_records: features.length,
        crs: "EPSG:4326",
      },
    };

    res.setHeader("Content-Type", "application/geo+json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="site_surveys_${Date.now()}.geojson"`,
    );
    res.json(geojson);
  } catch (err) {
    console.error("GET /api/surveys/export/geojson error:", err);
    res.status(500).json({ error: "Failed to export GeoJSON" });
  }
});

/**
 * GET /api/surveys/export/csv
 *
 * Exports a flat CSV with one row per survey.
 * latitude and longitude are explicit columns so the data can be
 * imported directly into GIS / CAD tools (e.g. QGIS, AutoCAD Map 3D).
 * Supports the same optional query filters as the GeoJSON endpoint.
 */
router.get("/export/csv", async (req: Request, res: Response) => {
  try {
    await ensureSurveySoftDeleteColumn();
    const { project_id, status, category_id } = req.query as Record<
      string,
      string
    >;
    const conditions: string[] = ["s.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (project_id) {
      conditions.push(`s.project_id  = $${params.push(project_id)}`);
    }
    if (status) {
      conditions.push(`s.status       = $${params.push(status)}`);
    }
    if (category_id) {
      conditions.push(`s.category_id  = $${params.push(category_id)}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT
         s.id,
         s.project_name,
         s.category_name,
         s.inspector_name,
         s.site_name,
         s.site_address,
         s.latitude,
         s.longitude,
         s.gps_accuracy,
         s.survey_date,
         s.notes,
         s.status,
         s.metadata,
         s.created_at,
         s.updated_at
       FROM surveys s
       ${where}
       ORDER BY s.survey_date DESC`,
      params,
    );
    const filename = `site_surveys_${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (rows.length === 0) {
      res.send(
        "id,project_name,category,inspector_name,site_name,site_address," +
          "latitude,longitude,gps_accuracy_m,survey_date,status,notes," +
          // Ground Mount columns
          "soil_type,slope_degrees,trenching_path,vegetation_clearing," +
          // Roof Mount columns
          "roof_material,rafter_size,rafter_spacing,roof_age_years,azimuth," +
          // Solar Fencing columns
          "perimeter_length_ft,lower_shade_risk,foundation_type,bifacial_surface," +
          "metadata_json,created_at,updated_at\n",
      );
      return;
    }

    const csv = csvStringify(
      rows.map((r) => {
        // Parse the JSONB metadata into typed fields for clean CSV columns
        const meta = r.metadata as Record<string, unknown> | null;
        const metaType = meta?.type as string | undefined;

        return {
          id: r.id,
          project_name: r.project_name,
          category: r.category_name ?? "",
          inspector_name: r.inspector_name,
          site_name: r.site_name,
          site_address: r.site_address ?? "",
          latitude: r.latitude ?? "",
          longitude: r.longitude ?? "",
          gps_accuracy_m: r.gps_accuracy ?? "",
          survey_date: r.survey_date
            ? new Date(r.survey_date as string).toISOString()
            : "",
          status: r.status,
          notes: r.notes ?? "",
          // --- Ground Mount ---
          soil_type: metaType === "ground_mount" ? (meta?.soil_type ?? "") : "",
          slope_degrees:
            metaType === "ground_mount" ? (meta?.slope_degrees ?? "") : "",
          trenching_path:
            metaType === "ground_mount" ? (meta?.trenching_path ?? "") : "",
          vegetation_clearing:
            metaType === "ground_mount"
              ? String(meta?.vegetation_clearing ?? "")
              : "",
          // --- Roof Mount ---
          roof_material:
            metaType === "roof_mount" ? (meta?.roof_material ?? "") : "",
          rafter_size:
            metaType === "roof_mount" ? (meta?.rafter_size ?? "") : "",
          rafter_spacing:
            metaType === "roof_mount" ? (meta?.rafter_spacing ?? "") : "",
          roof_age_years:
            metaType === "roof_mount" ? (meta?.roof_age_years ?? "") : "",
          azimuth: metaType === "roof_mount" ? (meta?.azimuth ?? "") : "",
          // --- Solar Fencing ---
          perimeter_length_ft:
            metaType === "solar_fencing"
              ? (meta?.perimeter_length_ft ?? "")
              : "",
          lower_shade_risk:
            metaType === "solar_fencing"
              ? String(meta?.lower_shade_risk ?? "")
              : "",
          foundation_type:
            metaType === "solar_fencing" ? (meta?.foundation_type ?? "") : "",
          bifacial_surface:
            metaType === "solar_fencing" ? (meta?.bifacial_surface ?? "") : "",
          // Raw JSON for any tooling that prefers it
          metadata_json: meta ? JSON.stringify(meta) : "",
          created_at: new Date(r.created_at as string).toISOString(),
          updated_at: new Date(r.updated_at as string).toISOString(),
        };
      }),
      { header: true },
    );

    res.send(csv);
  } catch (err) {
    console.error("GET /api/surveys/export/csv error:", err);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

// ================================================================
// BATCH SYNC  (offline-first mobile support)
// ================================================================

/**
 * POST /api/surveys/sync
 *
 * Accepts an array of surveys created offline on a mobile device.
 * Each entry includes its local UUID so the client can reconcile.
 */
router.post("/sync", async (req: Request, res: Response) => {
  const syncStartedAt = Date.now();
  const { device_id, surveys } = req.body as {
    device_id?: string;
    surveys: Array<{
      action: "create" | "update";
      survey: SurveyInput & { id?: string };
    }>;
  };

  await ensureSurveySoftDeleteColumn();

  if (!Array.isArray(surveys) || surveys.length === 0) {
    res.status(400).json({ error: "surveys array is required" });
    return;
  }

  for (const entry of surveys) {
    if (
      entry.survey.id !== undefined &&
      entry.survey.id !== null &&
      !isValidUuid(String(entry.survey.id))
    ) {
      respondValidationError(
        res,
        "survey.id must be a valid UUID",
        "id",
      );
      return;
    }
  }

  const results: Array<{
    id: string;
    action: string;
    success: boolean;
    error?: string;
  }> = [];
  const client = await pool.connect();

  try {
    for (const { action, survey: rawSurvey } of surveys) {
      // Normalise camelCase keys from mobile frontend to snake_case
      const survey = normalizeSurveyInput(rawSurvey as unknown as Record<string, unknown>);
      try {
        await client.query("BEGIN");

        const coords = extractCoords(survey);

        if (action === "create") {
          // Use the client-generated UUID so we can return it to the device
          const { rows: idRows } = await client.query(
            "SELECT gen_random_uuid() AS id",
          );
          const surveyId: string =
            (survey.id as string) || (idRows[0].id as string);

          const normalizedProjectId = await resolveExistingProjectId(
            client,
            survey.project_id,
          );
          const normalizedCategoryId = await resolveExistingCategoryId(
            client,
            survey.category_id,
          );
          const normalizedCategoryName = normalizeCategoryName(
            survey.category_id,
            survey.category_name,
          );

          const insertParams: unknown[] = [
            surveyId,
            survey.project_name,
            normalizedProjectId,
            normalizedCategoryId,
            normalizedCategoryName,
            survey.inspector_name,
            survey.site_name,
            survey.site_address ?? null,
            coords?.lat ?? null,
            coords?.lon ?? null,
            coords?.accuracy ?? null,
          ];

          const locationSql = coords
            ? geoExpr(insertParams, coords.lon, coords.lat)
            : "NULL";

          insertParams.push(
            survey.survey_date ? new Date(survey.survey_date) : new Date(),
            survey.notes ?? null,
            survey.status ?? "submitted",
            device_id ?? survey.device_id ?? null,
            survey.metadata != null ? JSON.stringify(survey.metadata) : null,
            survey.solarpro_user_id ?? null,
            survey.solarpro_project_id ?? null,
            survey.solarpro_email ?? null,
            survey.solarpro_org_id ?? null,
          );

          await client.query(
            `INSERT INTO surveys
               (id, project_name, project_id, category_id, category_name,
                inspector_name, site_name, site_address,
                latitude, longitude, gps_accuracy, location,
                survey_date, notes, status, device_id, metadata,
                solarpro_user_id, solarpro_project_id, solarpro_email, solarpro_org_id, synced_at)
             VALUES
               ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                ${locationSql},
                $${insertParams.length - 8},
                $${insertParams.length - 7},
                $${insertParams.length - 6},
                $${insertParams.length - 5},
                $${insertParams.length - 4},
                $${insertParams.length - 3},
                $${insertParams.length - 2},
                $${insertParams.length - 1},
                $${insertParams.length},
                NOW())
             ON CONFLICT (id) DO UPDATE SET
               project_name = EXCLUDED.project_name,
               project_id = EXCLUDED.project_id,
               category_id = EXCLUDED.category_id,
               category_name = EXCLUDED.category_name,
               inspector_name = EXCLUDED.inspector_name,
               site_name = EXCLUDED.site_name,
               site_address = EXCLUDED.site_address,
               latitude = EXCLUDED.latitude,
               longitude = EXCLUDED.longitude,
               gps_accuracy = EXCLUDED.gps_accuracy,
               location = EXCLUDED.location,
               survey_date = EXCLUDED.survey_date,
               notes = EXCLUDED.notes,
               status = EXCLUDED.status,
               device_id = EXCLUDED.device_id,
               metadata = EXCLUDED.metadata,
               solarpro_user_id = COALESCE(EXCLUDED.solarpro_user_id, surveys.solarpro_user_id),
               solarpro_project_id = COALESCE(EXCLUDED.solarpro_project_id, surveys.solarpro_project_id),
               solarpro_email = COALESCE(EXCLUDED.solarpro_email, surveys.solarpro_email),
               solarpro_org_id = COALESCE(EXCLUDED.solarpro_org_id, surveys.solarpro_org_id),
               synced_at = NOW(),
               updated_at = NOW()`,

            insertParams,
          );

          if (survey.checklist?.length)
            await upsertChecklist(client, surveyId, survey.checklist);
          if (survey.photos?.length)
            await upsertPhotos(client, surveyId, survey.photos);

          await client.query("COMMIT");
          results.push({ id: surveyId, action: "created", success: true });
        } else if (action === "update" && survey.id) {
          const coords = extractCoords(survey);
          const normalizedProjectId = await resolveExistingProjectId(
            client,
            survey.project_id,
          );
          const normalizedCategoryId = await resolveExistingCategoryId(
            client,
            survey.category_id,
          );
          const normalizedCategoryName = normalizeCategoryName(
            survey.category_id,
            survey.category_name,
          );

          const updateParams: unknown[] = [
            survey.id,
            survey.project_name ?? null,
            normalizedProjectId,
            normalizedCategoryId,
            normalizedCategoryName,
            survey.inspector_name ?? null,
            survey.site_name ?? null,
            survey.site_address ?? null,
            coords?.lat ?? null,
            coords?.lon ?? null,
            coords?.accuracy ?? null,
          ];

          const locationSql = coords
            ? geoExpr(updateParams, coords.lon, coords.lat)
            : "location"; // keep existing value

          updateParams.push(
            survey.notes ?? null,
            survey.status ?? null,
            survey.metadata != null ? JSON.stringify(survey.metadata) : null,
            survey.solarpro_user_id ?? null,
            survey.solarpro_project_id ?? null,
            survey.solarpro_email ?? null,
            survey.solarpro_org_id ?? null,
          );

          await client.query(
            `UPDATE surveys SET
               project_name   = COALESCE($2,  project_name),
               project_id     = COALESCE($3,  project_id),
               category_id    = COALESCE($4,  category_id),
               category_name  = COALESCE($5,  category_name),
               inspector_name = COALESCE($6,  inspector_name),
               site_name      = COALESCE($7,  site_name),
               site_address   = COALESCE($8,  site_address),
               latitude       = COALESCE($9,  latitude),
               longitude      = COALESCE($10, longitude),
               gps_accuracy   = COALESCE($11, gps_accuracy),
               location       = ${locationSql},
               notes          = COALESCE($${updateParams.length - 6}, notes),
               status         = COALESCE($${updateParams.length - 5}, status),
               metadata       = COALESCE($${updateParams.length - 4}::jsonb, metadata),
               solarpro_user_id = COALESCE($${updateParams.length - 3}, solarpro_user_id),
               solarpro_project_id = COALESCE($${updateParams.length - 2}, solarpro_project_id),
               solarpro_email = COALESCE($${updateParams.length - 1}, solarpro_email),
               solarpro_org_id = COALESCE($${updateParams.length}, solarpro_org_id),
               updated_at     = NOW()
             WHERE id = $1`,
            updateParams,
          );

          if (survey.checklist?.length)
            await upsertChecklist(client, survey.id, survey.checklist);
          if (survey.photos?.length)
            await upsertPhotos(client, survey.id, survey.photos);

          await client.query("COMMIT");
          results.push({ id: survey.id, action: "updated", success: true });
        }
      } catch (err) {
        await client.query("ROLLBACK");
        results.push({
          id: (survey as { id?: string }).id ?? "unknown",
          action,
          success: false,
          error: String(err),
        });
      }
    }

    const syncedCount = results.filter((r) => r.success).length;
    const errorCount = results.length - syncedCount;
    if (syncedCount > 0) incrementMetric("survey_sync_success_total", syncedCount);
    if (errorCount > 0) incrementMetric("survey_sync_error_total", errorCount);
    recordTiming("survey_sync_duration_ms", Date.now() - syncStartedAt);

    console.info(
      JSON.stringify({
        type: "survey_sync_summary",
        device_id: device_id ?? null,
        total: results.length,
        success: syncedCount,
        failed: errorCount,
      }),
    );

    res.json({ synced: syncedCount, results });
  } finally {
    client.release();
  }
});

/**
 * POST /api/surveys/:id/complete
 *
 * Marks a survey as completed and queues a webhook notification.
 */
router.post("/:id/complete", async (req: Request, res: Response) => {
  if (!requireUuidParam(req, res, "id")) return;

  try {
    await ensureSurveySoftDeleteColumn();
    await ensureWebhookDeliveriesTable();

    const surveyId = req.params.id;

    const { rows: existingDeliveryRows } = await pool.query<{
      event_id: string;
    }>(
      `SELECT event_id::text AS event_id
         FROM webhook_deliveries
        WHERE survey_id = $1 AND event_type = 'survey.completed'
        ORDER BY created_at ASC
        LIMIT 1`,
      [surveyId],
    );

    if (existingDeliveryRows.length > 0) {
      const { rows: surveyRows } = await pool.query<{ status: string }>(
        `SELECT status
           FROM surveys
          WHERE id = $1 AND deleted_at IS NULL
          LIMIT 1`,
        [surveyId],
      );

      if (surveyRows.length === 0) {
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      res.json({
        survey_id: surveyId,
        status: surveyRows[0].status,
        event_id: existingDeliveryRows[0].event_id,
      });
      return;
    }

    const completedAt = new Date().toISOString();

    const { rows: updatedRows } = await pool.query<{
      id: string;
      status: string;
      project_id: string | null;
      solarpro_user_id: string | null;
      solarpro_project_id: string | null;
      solarpro_email: string | null;
      solarpro_org_id: string | null;
      inspector_name: string | null;
      inspector_email: string | null;
      site_name: string | null;
      project_name: string | null;
    }>(
      `UPDATE surveys
          SET status = 'submitted',
              updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id::text, status, project_id::text,
                  solarpro_user_id, solarpro_project_id, solarpro_email,
                  solarpro_org_id, inspector_name, inspector_email,
                  site_name, project_name`,
      [surveyId],
    );

    if (updatedRows.length === 0) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const survey = updatedRows[0];

    const eventId = await enqueueSurveyCompleteWebhook({
      survey_id: survey.id,
      status: "submitted",
      completed_at: completedAt,
      // F-06: Pass ownership claims so SolarPro routes the ingest to the
      // correct user rather than falling back to SURVEY_INGEST_DEFAULT_USER_ID.
      solarpro_user_id: survey.solarpro_user_id ?? null,
      solarpro_project_id: survey.solarpro_project_id ?? null,
      solarpro_email: survey.solarpro_email ?? null,
      inspector_name: survey.inspector_name ?? null,
      inspector_email: survey.inspector_email ?? null,
      // F-06b: solarpro_org_id stores the SolarPro client UUID selected
      // on-device (set by handleClientSelect). Forward it as
      // solarpro_selected_client_id so the ingest pipeline can resolve the
      // client without having to look it up via the project row.
      solarpro_selected_client_id: survey.solarpro_org_id ?? null,
      // Survey naming: include so SolarPro can show "ray test" not the UUID
      project_name: survey.project_name ?? null,
      site_name: survey.site_name ?? null,
    });

    await processWebhookQueue(10);

    incrementMetric("webhook_enqueued_total");

    console.info(
      JSON.stringify({
        type: "survey_completed",
        survey_id: survey.id,
        event_id: eventId,
        project_id: survey.project_id,
        status: survey.status,
      }),
    );

    res.json({
      survey_id: survey.id,
      status: survey.status,
      event_id: eventId,
    });
  } catch (err) {
    console.error("POST /api/surveys/:id/complete error:", err);
    res.status(500).json({ error: "Failed to complete survey" });
  }
});

router.get("/admin/webhook-deliveries", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    await ensureWebhookDeliveriesTable();

    const { survey_id, status, limit = "100", offset = "0" } = req.query as Record<
      string,
      string
    >;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (survey_id) {
      if (!isValidUuid(survey_id)) {
        respondValidationError(res, "survey_id must be a valid UUID", "survey_id");
        return;
      }
      conditions.push(`survey_id = $${params.push(survey_id)}`);
    }

    if (status) {
      conditions.push(`status = $${params.push(status)}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 500)
      : 100;
    const safeOffset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    const { rows: countRows } = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM webhook_deliveries ${where}`,
      params,
    );

    params.push(safeLimit, safeOffset);

    const { rows } = await pool.query(
      `SELECT
         id::text,
         survey_id::text,
         event_type,
         event_id::text,
         payload,
         status,
         attempt_count,
         next_attempt_at,
         last_error,
         created_at,
         updated_at
       FROM webhook_deliveries
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params,
    );

    res.json({
      deliveries: rows,
      total: countRows[0]?.total ?? 0,
    });
  } catch (err) {
    console.error("GET /api/surveys/admin/webhook-deliveries error:", err);
    res.status(500).json({ error: "Failed to retrieve webhook deliveries" });
  }
});

router.get("/admin/surveys", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    await ensureSurveySoftDeleteColumn();

    const {
      status,
      project_id,
      include_total = "true",
      limit = "100",
      offset = "0",
    } = req.query as Record<
      string,
      string
    >;

    const conditions: string[] = ["s.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (status) {
      conditions.push(`s.status = $${params.push(status)}`);
    }

    if (project_id) {
      if (!isValidUuid(project_id)) {
        respondValidationError(res, "project_id must be a valid UUID", "project_id");
        return;
      }
      conditions.push(`s.project_id = $${params.push(project_id)}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 500)
      : 100;
    const safeOffset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
    const shouldIncludeTotal = include_total !== "false";

    let total = null;
    if (shouldIncludeTotal) {
      const { rows: countRows } = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM surveys s ${where}`,
        params,
      );
      total = countRows[0]?.total ?? 0;
    }

    params.push(safeLimit, safeOffset);

    const { rows } = await pool.query(
      `SELECT
         s.id::text,
         s.project_name,
         s.project_id::text,
         s.category_id::text,
         s.category_name,
         s.inspector_name,
         s.site_name,
         s.site_address,
         s.latitude,
         s.longitude,
         s.gps_accuracy,
         s.survey_date,
         s.status,
         s.notes,
         s.created_at,
         s.updated_at,
         (SELECT COUNT(*)::int FROM checklist_items c WHERE c.survey_id = s.id) AS checklist_count,
         (SELECT COUNT(*)::int FROM survey_photos p WHERE p.survey_id = s.id) AS photo_count
       FROM surveys s
       ${where}
       ORDER BY s.updated_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params,
    );

    res.setHeader("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
    res.json({
      surveys: rows,
      total,
    });
  } catch (err) {
    console.error("GET /api/surveys/admin/surveys error:", err);
    res.status(500).json({ error: "Failed to retrieve admin survey list" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    await ensureSurveySoftDeleteColumn();
    const {
      project_id,
      status,
      category_id,
      include_total = "true",
      limit = "100",
      offset = "0",
    } = req.query as Record<string, string>;

    const conditions: string[] = ["s.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (project_id) {
      conditions.push(`s.project_id  = $${params.push(project_id)}`);
    }
    if (status) {
      conditions.push(`s.status       = $${params.push(status)}`);
    }
    if (category_id) {
      conditions.push(`s.category_id  = $${params.push(category_id)}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    const lim = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 500)
      : 100;
    const off = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
    const shouldIncludeTotal = include_total !== "false";

    let total = null;
    if (shouldIncludeTotal) {
      const { rows: countRows } = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM surveys s ${where}`,
        params,
      );
      total = countRows[0]?.total ?? 0;
    }

    params.push(lim, off);

    const { rows } = await pool.query(
      `SELECT
         s.id,
         s.project_name,
         s.category_name,
         COALESCE(cat.name, s.category_name) AS resolved_category,
         s.inspector_name,
         s.site_name,
         s.site_address,
         s.latitude,
         s.longitude,
         s.survey_date,
         s.status,
         s.notes,
         s.created_at,
         s.updated_at,
         (SELECT COUNT(*)::int FROM checklist_items c WHERE c.survey_id = s.id) AS checklist_count,
         (SELECT COUNT(*)::int FROM survey_photos   p WHERE p.survey_id = s.id) AS photo_count
       FROM surveys s
       LEFT JOIN categories cat ON cat.id = s.category_id
       ${where}
       ORDER BY s.survey_date DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params,
    );

    res.setHeader("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
    res.json({ surveys: rows, total });
  } catch (err) {
    console.error("GET /api/surveys error:", err);
    res.status(500).json({ error: "Failed to retrieve surveys" });
  }
});

router.get("/:id/report", async (req: Request, res: Response) => {
  if (!requireUuidParam(req, res, "id")) return;
  try {
    const survey = await fetchSurveyFull(req.params.id);
    if (!survey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const report = generateReport(survey as any);
    const format = (req.query["format"] as string | undefined)?.toLowerCase();

    if (format === "markdown") {
      const md = toMarkdown(report);
      const filename = `engineering-report-${req.params.id}-${Date.now()}.md`;
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(md);
      return;
    }

    res.json(report);
  } catch (err) {
    console.error("GET /api/surveys/:id/report error:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

router.delete("/:id/report", async (req: Request, res: Response) => {
  if (!requireUuidParam(req, res, "id")) return;
  try {
    const survey = await fetchSurveyFull(req.params.id);
    if (!survey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    res.json({ message: "Report cleared" });
  } catch (err) {
    console.error("DELETE /api/surveys/:id/report error:", err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

async function mapSurveyPhotosWithRemoteUrls(
  photos: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  if (photos.length === 0) return photos;

  return photos.map((photo) => {
    const photoId = typeof photo.id === "string" ? photo.id : "";
    const hasPhotoData = photo.has_photo_data === true;

    // If photo binary is stored in DB, serve via the /api/surveys/photos/:id endpoint.
    // This is always accessible regardless of Render disk state.
    if (hasPhotoData && photoId) {
      const serveUrl = `/api/surveys/photos/${photoId}`;
      return { ...photo, remote_url: serveUrl, file_path: serveUrl };
    }

    // Fallback: use file_path as-is (legacy local disk or S3 presigned URL)
    const filePath =
      typeof photo.file_path === "string" ? (photo.file_path as string) : "";
    const remoteUrl = filePath.startsWith("http")
      ? filePath
      : filePath.startsWith("/")
        ? filePath
        : filePath
          ? `/uploads/${filePath}`
          : "";

    return { ...photo, remote_url: remoteUrl };
  });
}

function requireSurveyReadAccess(req: Request, res: Response): boolean {
  const role = req.authUser?.role;
  if (role === "admin" || role === "user") {
    return true;
  }

  res.status(403).json({ error: "Forbidden" });
  return false;
}

/**
 * GET /api/surveys/photos/:photoId
 *
 * Serves a photo binary stored in survey_photos.photo_data (bytea).
 * This is the persistent photo serving endpoint — works regardless of
 * whether Render's ephemeral /uploads/ disk has been wiped.
 *
 * No auth required for serving (photos are identified by UUID — guessing
 * is not practical). This matches how static file serving works.
 */
router.get("/photos/:photoId", async (req: Request, res: Response) => {
  const { photoId } = req.params;
  if (!photoId || !/^[0-9a-f-]{36}$/.test(photoId)) {
    res.status(400).json({ error: "Invalid photo id" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT photo_data, mime_type, filename FROM survey_photos WHERE id = $1 LIMIT 1`,
      [photoId],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    const row = rows[0] as { photo_data: Buffer | null; mime_type: string; filename: string };

    if (!row.photo_data) {
      res.status(404).json({ error: "Photo binary not available" });
      return;
    }

    const mimeType = row.mime_type || "image/jpeg";
    const filename = row.filename || "photo.jpg";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", row.photo_data.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${filename}"`,
    );
    res.send(row.photo_data);
  } catch (err) {
    console.error("[GET /photos/:photoId] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** GET /api/surveys/:id */
router.get("/:id", async (req: Request, res: Response) => {
  if (!requireUuidParam(req, res, "id")) return;
  if (!requireSurveyReadAccess(req, res)) return;

  try {
    const survey = await fetchSurveyFull(req.params.id);
    if (!survey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const normalizedPhotos = await mapSurveyPhotosWithRemoteUrls(
      (survey.photos as Array<Record<string, unknown>>) ?? [],
    );

    res.json({
      ...survey,
      photos: normalizedPhotos,
    });
  } catch (err) {
    console.error("GET /api/surveys/:id error:", err);
    res.status(500).json({ error: "Failed to retrieve survey" });
  }
});

/** DELETE /api/surveys/:id */
router.delete("/:id", async (req: Request, res: Response) => {
  if (!requireUuidParam(req, res, "id")) return;

  const { id } = req.params;

  try {
    await ensureSurveySoftDeleteColumn();

    const { rows: existing } = await pool.query<{ id: string }>(
      `SELECT id::text FROM surveys WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );

    if (existing.length === 0) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    await softDeleteSurveyAndQueueCleanup(id);

    try {
      await syncSurveyDeletionToSqlServer(id);
    } catch (syncError) {
      console.warn("DELETE /api/surveys/:id SQL Server mirror delete skipped:", syncError);
    }

    broadcastSurveyEvent("survey.deleted", { id });
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/surveys/:id error:", err);
    res.status(500).json({ error: "Failed to delete survey" });
  }
});

/**
 * Normalise a request body that may use camelCase keys (sent by the mobile
 * frontend) into the snake_case SurveyInput shape expected by the backend.
 *
 * Mobile frontend sends:
 *   { title, siteName, siteAddress, inspectorName, dateTime,
 *     gpsCoordinates: { latitude, longitude, accuracy },
 *     photos: [{ name, dataUrl, mimeType, capturedAt }], ... }
 *
 * Backend expects:
 *   { project_name, site_name, site_address, inspector_name, survey_date,
 *     latitude, longitude, gps_accuracy,
 *     photos: [{ filename, data_url, mime_type, captured_at }], ... }
 */
function normalizeSurveyInput(raw: Record<string, unknown>): SurveyInput & { id?: string } {
  // Coerce coordinates from gpsCoordinates object if present
  const gps = raw.gpsCoordinates as { latitude?: number; longitude?: number; accuracy?: number } | undefined;

  // Coerce photos: mobile sends camelCase Photo objects
  let photos: PhotoInput[] | undefined = undefined;
  if (Array.isArray(raw.photos)) {
    photos = (raw.photos as Record<string, unknown>[]).map((p) => ({
      filename:    (p.filename   ?? p.name)        as string | undefined,
      name:        p.name                          as string | undefined,
      label:       p.label                         as string | undefined,
      data_url:    (p.data_url   ?? p.dataUrl)     as string | undefined,
      dataUrl:     p.dataUrl                       as string | undefined,
      mime_type:   (p.mime_type  ?? p.mimeType)    as string | undefined,
      mimeType:    p.mimeType                      as string | undefined,
      captured_at: (p.captured_at ?? p.capturedAt) as string | undefined,
      capturedAt:  p.capturedAt                    as string | undefined,
    }));
  }

  return {
    // Prefer snake_case, fall back to camelCase from mobile
    id:             raw.id                                                    as string | undefined,
    project_name:   ((raw.project_name ?? raw.title ?? raw.siteName) as string | undefined) ?? "",
    project_id:     raw.project_id                                            as string | undefined,
    category_id:    raw.category_id                                           as string | undefined,
    category_name:  raw.category_name                                         as string | undefined,
    inspector_name: (raw.inspector_name ?? raw.inspectorName)                 as string,
    site_name:      (raw.site_name      ?? raw.siteName)                      as string,
    site_address:   (raw.site_address   ?? raw.siteAddress)                   as string | undefined,
    latitude:       (raw.latitude  ?? gps?.latitude)                          as number | undefined,
    longitude:      (raw.longitude ?? gps?.longitude)                         as number | undefined,
    gps_accuracy:   (raw.gps_accuracy ?? gps?.accuracy)                       as number | undefined,
    survey_date:    (raw.survey_date    ?? raw.dateTime)                       as string | undefined,
    notes:          raw.notes                                                  as string | undefined,
    status:         raw.status                                                 as string | undefined,
    device_id:      raw.device_id                                              as string | undefined,
    solarpro_user_id:     raw.solarpro_user_id                                as string | null | undefined,
    solarpro_project_id:  raw.solarpro_project_id                             as string | null | undefined,
    solarpro_email:       raw.solarpro_email                                  as string | null | undefined,
    solarpro_org_id:      raw.solarpro_org_id                                 as string | null | undefined,
    metadata:       raw.metadata                                               as SurveyMetadata | null | undefined,
    checklist:      raw.checklist                                              as ChecklistItemInput[] | undefined,
    photos,
  };
}

/**
 * POST /api/surveys
 *
 * Accepts location as either:
 *   { "location": { "type": "Point", "coordinates": [lon, lat] } }
 * or flat fields:
 *   { "latitude": 51.5, "longitude": -0.1, "gps_accuracy": 5 }
 *
 * The geography column is populated with:
 *   ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
 *
 * Also accepts camelCase keys from the mobile frontend (siteName, siteAddress,
 * inspectorName, dateTime, gpsCoordinates, photos[].dataUrl etc.).
 */
router.post("/", async (req: Request, res: Response) => {
  const body = normalizeSurveyInput(req.body as Record<string, unknown>);

  if (body.id && !isValidUuid(body.id)) {
    respondValidationError(res, "id must be a valid UUID", "id");
    return;
  }

  if (
    !body.project_name?.trim() ||
    !body.inspector_name?.trim() ||
    !body.site_name?.trim()
  ) {
    res.status(400).json({
      error: "project_name, inspector_name, and site_name are required",
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const normalizedProjectId = await resolveExistingProjectId(
      client,
      body.project_id,
    );
    const normalizedCategoryId = await resolveExistingCategoryId(
      client,
      body.category_id,
    );
    const normalizedCategoryName = normalizeCategoryName(
      body.category_id,
      body.category_name,
    );

    // Allow the client to supply an ID (for offline-first mobile sync)
    const { rows: idRows } = await client.query(
      "SELECT gen_random_uuid() AS id",
    );
    const surveyId: string = body.id ?? (idRows[0].id as string);

    const coords = extractCoords(body);

    // Build parameterised values list
    const insertParams: unknown[] = [
      surveyId,
      body.project_name.trim(),
      normalizedProjectId,
      normalizedCategoryId,
      normalizedCategoryName,
      body.inspector_name.trim(),
      body.site_name.trim(),
      body.site_address ?? null,
      coords?.lat ?? null, // $9  â€” latitude  column
      coords?.lon ?? null, // $10 â€” longitude column
      coords?.accuracy ?? null, // $11 â€” gps_accuracy column
    ];

    // $12 onwards: geography expression or NULL
    const locationSql = coords
      ? geoExpr(insertParams, coords.lon, coords.lat)
      : "NULL";

    insertParams.push(
      body.survey_date ? new Date(body.survey_date) : new Date(), // survey_date
      body.notes ?? null, // notes
      body.status ?? "draft", // status
      body.device_id ?? null, // device_id
      body.metadata != null ? JSON.stringify(body.metadata) : null, // metadata
      body.solarpro_user_id ?? null,
      body.solarpro_project_id ?? null,
      body.solarpro_email ?? null,
      body.solarpro_org_id ?? null,
    );

    const { rows } = await client.query(
      `INSERT INTO surveys
         (id, project_name, project_id, category_id, category_name,
          inspector_name, site_name, site_address,
          latitude, longitude, gps_accuracy, location,
          survey_date, notes, status, device_id, metadata,
          solarpro_user_id, solarpro_project_id, solarpro_email, solarpro_org_id)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          ${locationSql},
          $${insertParams.length - 8},
          $${insertParams.length - 7},
          $${insertParams.length - 6},
          $${insertParams.length - 5},
          $${insertParams.length - 4},
          $${insertParams.length - 3},
          $${insertParams.length - 2},
          $${insertParams.length - 1},
          $${insertParams.length})
       ON CONFLICT (id) DO UPDATE SET
         project_name = EXCLUDED.project_name,
         project_id = EXCLUDED.project_id,
         category_id = EXCLUDED.category_id,
         category_name = EXCLUDED.category_name,
         inspector_name = EXCLUDED.inspector_name,
         site_name = EXCLUDED.site_name,
         site_address = EXCLUDED.site_address,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         gps_accuracy = EXCLUDED.gps_accuracy,
         location = EXCLUDED.location,
         survey_date = EXCLUDED.survey_date,
         notes = EXCLUDED.notes,
         status = EXCLUDED.status,
         device_id = EXCLUDED.device_id,
         metadata = EXCLUDED.metadata,
         solarpro_user_id = COALESCE(EXCLUDED.solarpro_user_id, surveys.solarpro_user_id),
         solarpro_project_id = COALESCE(EXCLUDED.solarpro_project_id, surveys.solarpro_project_id),
         solarpro_email = COALESCE(EXCLUDED.solarpro_email, surveys.solarpro_email),
         solarpro_org_id = COALESCE(EXCLUDED.solarpro_org_id, surveys.solarpro_org_id),
         updated_at = NOW()
       RETURNING id`,
      insertParams,
    );

    const newId = rows[0].id as string;

    if (body.checklist?.length)
      await upsertChecklist(client, newId, body.checklist);
    if (body.photos?.length) await upsertPhotos(client, newId, body.photos);

    await client.query("COMMIT");

    const full = await fetchSurveyFull(newId);
    broadcastSurveyEvent("survey.created", full);
    res.status(201).json(full);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/surveys error:", err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: "Failed to create survey",
      details: message,
    });
  } finally {
    client.release();
  }
});

// ================================================================
// UPDATE SURVEY
// ================================================================

/** PUT /api/surveys/:id */
router.put("/:id", async (req: Request, res: Response) => {
  if (!requireUuidParam(req, res, "id")) return;
  const { id } = req.params;
  // Normalise camelCase keys from mobile frontend to snake_case
  const body = normalizeSurveyInput(req.body as Record<string, unknown>) as Partial<SurveyInput>;

  await ensureSurveySoftDeleteColumn();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query(
      "SELECT id FROM surveys WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    if (existing.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Survey not found" });
      return;
    }

    const coords = extractCoords(body as SurveyInput);
    const normalizedProjectId = await resolveExistingProjectId(
      client,
      body.project_id,
    );
    const normalizedCategoryId = await resolveExistingCategoryId(
      client,
      body.category_id,
    );
    const normalizedCategoryName = normalizeCategoryName(
      body.category_id,
      body.category_name,
    );

    const updateParams: unknown[] = [
      id,
      body.project_name ?? null,
      normalizedProjectId,
      normalizedCategoryId,
      normalizedCategoryName,
      body.inspector_name ?? null,
      body.site_name ?? null,
      body.site_address ?? null,
      coords?.lat ?? null, // $9
      coords?.lon ?? null, // $10
      coords?.accuracy ?? null, // $11
    ];

    // Keep existing location when no new coords are supplied
    const locationSql = coords
      ? geoExpr(updateParams, coords.lon, coords.lat)
      : "location";

    updateParams.push(
      body.notes ?? null,
      body.status ?? null,
      body.metadata != null ? JSON.stringify(body.metadata) : null,
      body.solarpro_user_id ?? null,
      body.solarpro_project_id ?? null,
      body.solarpro_email ?? null,
      body.solarpro_org_id ?? null,
    );

    await client.query(
      `UPDATE surveys SET
         project_name   = COALESCE($2,  project_name),
         project_id     = COALESCE($3,  project_id),
         category_id    = COALESCE($4,  category_id),
         category_name  = COALESCE($5,  category_name),
         inspector_name = COALESCE($6,  inspector_name),
         site_name      = COALESCE($7,  site_name),
         site_address   = COALESCE($8,  site_address),
         latitude       = COALESCE($9,  latitude),
         longitude      = COALESCE($10, longitude),
         gps_accuracy   = COALESCE($11, gps_accuracy),
         location       = ${locationSql},
         notes          = COALESCE($${updateParams.length - 6}, notes),
         status         = COALESCE($${updateParams.length - 5}, status),
         metadata       = COALESCE($${updateParams.length - 4}::jsonb, metadata),
         solarpro_user_id = COALESCE($${updateParams.length - 3}, solarpro_user_id),
         solarpro_project_id = COALESCE($${updateParams.length - 2}, solarpro_project_id),
         solarpro_email = COALESCE($${updateParams.length - 1}, solarpro_email),
         solarpro_org_id = COALESCE($${updateParams.length}, solarpro_org_id),
         updated_at     = NOW()
       WHERE id = $1`,
      updateParams,
    );

    if (body.checklist?.length)
      await upsertChecklist(client, id, body.checklist);
    if (body.photos?.length) await upsertPhotos(client, id, body.photos);

    await client.query("COMMIT");

    const full = await fetchSurveyFull(id);
    broadcastSurveyEvent("survey.updated", full);
    res.json(full);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PUT /api/surveys/:id error:", err);
    res.status(500).json({ error: "Failed to update survey" });
  } finally {
    client.release();
  }
});

// ================================================================
// PHOTO UPLOAD  (multipart/form-data from mobile)
// ================================================================

/**
 * POST /api/surveys/:id/photos
 *
 * Accepts one or more image files as multipart/form-data.
 * Field names: "photos" (multiple) or "photo" (single).
 * Optional body fields per file: label, captured_at
 */
router.post(
  "/:id/photos",
  (req: Request, res: Response, next) => {
    upload.fields([
      { name: "photos", maxCount: 20 },
      { name: "photo", maxCount: 1 },
    ])(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "Image exceeds 20MB limit" });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        res.status(400).json({ error: message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    await ensureSurveySoftDeleteColumn();

    if (!requireUuidParam(req, res, "id")) return;
    const { id } = req.params;

    const filesPayload = req.files as
      | Express.Multer.File[]
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    const files = Array.isArray(filesPayload)
      ? filesPayload
      : [
          ...(filesPayload?.photos ?? []),
          ...(filesPayload?.photo ?? []),
        ];

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No image files provided" });
      return;
    }

    // Labels may be passed as a JSON array string or a single string
    let labels: string[] = [];
    try {
      if (req.body.labels) {
        labels = JSON.parse(req.body.labels as string);
      } else if (req.body.label) {
        labels = [req.body.label as string];
      }
    } catch {
      /* ignore parse errors */
    }

    const captured_at = req.body.captured_at
      ? new Date(req.body.captured_at as string)
      : new Date();

    const inserted: unknown[] = [];
    const uploadedPaths: string[] = [];
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify the survey exists
      const { rows } = await client.query("SELECT id FROM surveys WHERE id = $1", [
        id,
      ]);
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Survey not found" });
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const label = labels[i] ?? file.originalname ?? "";

        // Upload buffer to storage backend (local disk or S3)
        const ext = path.extname(file.originalname) || ".jpg";
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
        const storedPath = await uploadFile(file.buffer, filename, file.mimetype);
        uploadedPaths.push(storedPath);

        const { rows: photoRows } = await client.query(
          `INSERT INTO survey_photos
         (survey_id, filename, label, file_path, mime_type, captured_at, photo_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
          [
            id,
            file.originalname,
            label,
            storedPath, // URL returned by storageClient (local path or S3 presigned URL)
            file.mimetype,
            captured_at,
            file.buffer, // store raw binary for persistent DB-backed serving
          ],
        );
        inserted.push(photoRows[0]);
      }

      await client.query("COMMIT");
      res.status(201).json({ uploaded: inserted.length, photos: inserted });
    } catch (err) {
      await client.query("ROLLBACK");

      for (const uploadedPath of uploadedPaths) {
        try {
          await deleteFile(uploadedPath);
        } catch (cleanupError) {
          console.warn("Failed to cleanup uploaded photo after rollback:", cleanupError);
        }
      }

      const message = err instanceof Error ? err.message : "Failed to upload photos";
      res.status(500).json({ error: message });
    } finally {
      client.release();
    }
  },
);


export { ensureSurveySoftDeleteColumn };
export default router;
