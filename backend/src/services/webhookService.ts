import { createHmac, randomUUID } from "crypto";
import { pool } from "../database";
import { deleteFile } from "../utils/storageClient";
import { incrementMetric } from "./metrics";

interface SurveyCompletePayload {
  /** survey.completed: a site survey. install.completed: an install/final photo phase. */
  event: "survey.completed" | "install.completed";
  /** install.completed only: which phase was finished ("install_day" | "final_inspection"). */
  phase?: string | null;
  event_id: string;
  occurred_at: string;
  survey_id: string;
  status: string;
  completed_at: string;
  // F-06: Ownership routing — populated from survey record so SolarPro
  // can scope the ingest to the correct user instead of falling back to
  // the service account (SURVEY_INGEST_DEFAULT_USER_ID).
  solarpro_user_id?: string | null;
  solarpro_project_id?: string | null;
  solarpro_email?: string | null;
  // Inspector identity — used as fallback ownership resolution
  inspector_name?: string | null;
  inspector_email?: string | null;
  // On-device picker selections (standalone surveys)
  solarpro_selected_project_id?: string | null;
  solarpro_selected_client_id?: string | null;
  // Survey naming — sent in thin event so SolarPro can show the human-readable
  // name even in degraded mode (when fetchFullPayload returns null).
  project_name?: string | null;
  site_name?: string | null;
}

interface WebhookDeliveryRow {
  id: string;
  survey_id: string;
  event_type: string;
  event_id: string;
  payload: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string;
  last_error: string | null;
}

const RETRY_MINUTES = [1, 5, 30, 120, 720];
const WEBHOOK_TIMEOUT_MS = 15_000;
// A row left in 'sending' (process died mid-delivery) is picked up again after this.
const STALE_SENDING_MINUTES = 10;
let tableReady: Promise<void> | null = null;
let surveySyncColumnReady: Promise<void> | null = null;

async function ensureSurveySyncColumn(): Promise<void> {
  if (!surveySyncColumnReady) {
    surveySyncColumnReady = pool
      .query(
        `ALTER TABLE surveys ADD COLUMN IF NOT EXISTS solarpro_synced_at TIMESTAMPTZ`,
      )
      .then(() => undefined)
      .catch((error) => {
        surveySyncColumnReady = null;
        throw error;
      });
  }

  await surveySyncColumnReady;
}

function getWebhookUrl(): string | null {
  const url = process.env.SOLARPRO_WEBHOOK_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function getWebhookSecret(): string | null {
  const secret = process.env.SURVEY_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export async function ensureWebhookDeliveriesTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          event_id UUID NOT NULL UNIQUE,
          payload JSONB NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempt_count INT NOT NULL DEFAULT 0,
          next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      )
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }

  await tableReady;
}

function nextAttemptAt(attemptCount: number): Date | null {
  if (attemptCount >= RETRY_MINUTES.length) return null;
  const minutes = RETRY_MINUTES[attemptCount];
  return new Date(Date.now() + minutes * 60 * 1000);
}

export async function enqueueSurveyCompleteWebhook(params: {
  survey_id: string;
  status: string;
  completed_at: string;
  // F-06: Ownership routing fields — must be passed so SolarPro scopes
  // the ingest to the correct user rather than the service account fallback.
  solarpro_user_id?: string | null;
  solarpro_project_id?: string | null;
  solarpro_email?: string | null;
  inspector_name?: string | null;
  inspector_email?: string | null;
  solarpro_selected_project_id?: string | null;
  solarpro_selected_client_id?: string | null;
  // Survey naming fields
  project_name?: string | null;
  site_name?: string | null;
  /** Defaults to survey.completed. */
  event?: "survey.completed" | "install.completed";
  phase?: string | null;
}): Promise<string> {
  await ensureWebhookDeliveriesTable();

  const eventId = randomUUID();
  const payload: SurveyCompletePayload = {
    event: params.event ?? "survey.completed",
    ...(params.phase ? { phase: params.phase } : {}),
    event_id: eventId,
    occurred_at: new Date().toISOString(),
    survey_id: params.survey_id,
    status: params.status,
    completed_at: params.completed_at,
    // F-06: Include ownership claims so SolarPro resolves the correct user
    solarpro_user_id: params.solarpro_user_id ?? null,
    solarpro_project_id: params.solarpro_project_id ?? null,
    solarpro_email: params.solarpro_email ?? null,
    inspector_name: params.inspector_name ?? null,
    inspector_email: params.inspector_email ?? null,
    solarpro_selected_project_id: params.solarpro_selected_project_id ?? null,
    solarpro_selected_client_id: params.solarpro_selected_client_id ?? null,
    // Survey naming: pass through so SolarPro shows the human-readable name
    project_name: params.project_name ?? null,
    site_name: params.site_name ?? null,
  };

  await pool.query(
    `INSERT INTO webhook_deliveries
      (survey_id, event_type, event_id, payload, status, attempt_count, next_attempt_at)
     VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, NOW())`,
    [params.survey_id, payload.event, eventId, JSON.stringify(payload)],
  );

  return eventId;
}

/**
 * solarpro_synced_at starts the photo-retention clock (photoRetentionPurge).
 * An install job's install-day hand-off must not start it: the final
 * inspection is often 1-3 weeks later and still needs those photos.
 */
export function startsRetentionClock(payloadText: string): boolean {
  try {
    const p = JSON.parse(payloadText) as { event?: string; phase?: string };
    return p.event !== "install.completed" || p.phase === "final_inspection";
  } catch {
    return true;
  }
}

async function markDelivered(
  id: string,
  attemptCount: number,
  surveyId: string,
  startRetention = true,
): Promise<void> {
  await pool.query(
    `UPDATE webhook_deliveries
        SET status = 'delivered',
            attempt_count = $2,
            last_error = NULL,
            next_attempt_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [id, attemptCount],
  );

  if (!startRetention) return;
  await ensureSurveySyncColumn();
  await pool.query(
    `UPDATE surveys
        SET solarpro_synced_at = COALESCE(solarpro_synced_at, NOW()),
            updated_at = NOW()
      WHERE id = $1`,
    [surveyId],
  );
}

async function markRetry(
  id: string,
  attemptCount: number,
  errorMessage: string,
): Promise<void> {
  const nextAt = nextAttemptAt(attemptCount);
  if (!nextAt) {
    await pool.query(
      `UPDATE webhook_deliveries
          SET status = 'failed',
              attempt_count = $2,
              last_error = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [id, attemptCount, errorMessage],
    );
    return;
  }

  await pool.query(
    `UPDATE webhook_deliveries
        SET status = 'pending',
            attempt_count = $2,
            last_error = $3,
            next_attempt_at = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [id, attemptCount, errorMessage, nextAt.toISOString()],
  );
}

function buildSignature(payloadText: string, timestamp: string, secret: string): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payloadText}`)
    .digest("hex");
  return `sha256=${digest}`;
}

function isNonRetriableStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 501;
}

async function markFailed(
  id: string,
  attemptCount: number,
  errorMessage: string,
): Promise<void> {
  await pool.query(
    `UPDATE webhook_deliveries
        SET status = 'failed',
            attempt_count = $2,
            last_error = $3,
            updated_at = NOW()
      WHERE id = $1`,
    [id, attemptCount, errorMessage],
  );
}

async function deliverOne(row: WebhookDeliveryRow): Promise<void> {
  const url = getWebhookUrl();
  const secret = getWebhookSecret();

  if (!url || !secret) {
    await markRetry(row.id, row.attempt_count + 1, "Webhook config is missing");
    return;
  }

  const timestamp = new Date().toISOString();
  const payloadText = row.payload;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Survey-Signature": buildSignature(payloadText, timestamp, secret),
        "X-Survey-Timestamp": timestamp,
        "X-Survey-Event-Id": row.event_id,
      },
      body: payloadText,
      // Without a timeout a hung SolarPro request blocks /complete and the
      // worker indefinitely; a timeout is treated like any network error.
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    // ── SOLARPRO_WEBHOOK_SEND ──────────────────────────────────────────────
    // Emitted after every delivery attempt so we can see the URL called,
    // the HTTP status SolarPro returned, and the first 500 chars of the
    // response body. Search Render logs for: SOLARPRO_WEBHOOK_SEND
    let responseBodySnippet = "";
    try {
      const cloned = response.clone();
      const text = await cloned.text();
      responseBodySnippet = text.slice(0, 500);
    } catch { /* non-fatal */ }
    console.info(
      JSON.stringify({
        tag:          "SOLARPRO_WEBHOOK_SEND",
        timestamp:    new Date().toISOString(),
        surveyId:     row.survey_id,
        eventId:      row.event_id,
        url,
        status:       response.status,
        ok:           response.ok,
        responseBody: responseBodySnippet,
      }),
    );

    const nextAttempt = row.attempt_count + 1;
    if (response.ok) {
      await markDelivered(row.id, nextAttempt, row.survey_id, startsRetentionClock(payloadText));
      incrementMetric("webhook_delivered_total");
      console.info(
        JSON.stringify({
          type: "webhook_delivery",
          delivery_id: row.id,
          survey_id: row.survey_id,
          event_id: row.event_id,
          status: "delivered",
          attempt: nextAttempt,
        }),
      );
      return;
    }

    if (isNonRetriableStatus(response.status)) {
      await markFailed(row.id, nextAttempt, `HTTP ${response.status}`);
      incrementMetric("webhook_failed_total");
      console.warn(
        JSON.stringify({
          type: "webhook_delivery",
          delivery_id: row.id,
          survey_id: row.survey_id,
          event_id: row.event_id,
          status: "failed",
          attempt: nextAttempt,
          http_status: response.status,
          non_retriable: true,
        }),
      );
      return;
    }

    await markRetry(row.id, nextAttempt, `HTTP ${response.status}`);
    incrementMetric("webhook_failed_total");
    console.warn(
      JSON.stringify({
        type: "webhook_delivery",
        delivery_id: row.id,
        survey_id: row.survey_id,
        event_id: row.event_id,
        status: "retry",
        attempt: nextAttempt,
        http_status: response.status,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markRetry(row.id, row.attempt_count + 1, message);
    incrementMetric("webhook_failed_total");
    console.warn(
      JSON.stringify({
        type: "webhook_delivery",
        delivery_id: row.id,
        survey_id: row.survey_id,
        event_id: row.event_id,
        status: "retry",
        attempt: row.attempt_count + 1,
        error: message,
      }),
    );
  }
}

export async function processWebhookQueue(limit = 25): Promise<void> {
  await ensureWebhookDeliveriesTable();

  // Claim rows atomically so the background worker and the inline call from
  // /complete never send the same delivery twice at the same time.
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `UPDATE webhook_deliveries d
        SET status = 'sending',
            updated_at = NOW()
      WHERE d.id IN (
              SELECT id
                FROM webhook_deliveries
               WHERE (status = 'pending' AND next_attempt_at <= NOW())
                  OR (status = 'sending' AND updated_at < NOW() - make_interval(mins => $2))
               ORDER BY next_attempt_at ASC
               LIMIT $1
               FOR UPDATE SKIP LOCKED
            )
      RETURNING
        d.id,
        d.survey_id,
        d.event_type,
        d.event_id,
        d.payload::text AS payload,
        d.status,
        d.attempt_count,
        d.next_attempt_at::text AS next_attempt_at,
        d.last_error`,
    [limit, STALE_SENDING_MINUTES],
  );

  for (const row of rows) {
    await deliverOne(row);
  }
}

/**
 * Put a failed survey.completed delivery back in the queue (same event_id).
 * Owner fields that were missing when the row was first built are filled in
 * from `ownerEmail` so the resend can be routed to the right SolarPro user.
 * Returns true when a failed row was requeued.
 */
export async function requeueFailedSurveyWebhook(
  surveyId: string,
  ownerEmail: string | null,
): Promise<boolean> {
  await ensureWebhookDeliveriesTable();
  const { rowCount } = await pool.query(
    `UPDATE webhook_deliveries
        SET status = 'pending',
            attempt_count = 0,
            last_error = NULL,
            next_attempt_at = NOW(),
            updated_at = NOW(),
            payload = payload || jsonb_strip_nulls(jsonb_build_object(
              'solarpro_email',  COALESCE(payload->>'solarpro_email',  $2::text),
              'inspector_email', COALESCE(payload->>'inspector_email', $2::text)
            ))
      WHERE survey_id = $1
        AND event_type = 'survey.completed'
        AND status = 'failed'`,
    [surveyId, ownerEmail],
  );
  return (rowCount ?? 0) > 0;
}

let workerHandle: NodeJS.Timeout | null = null;
let cleanupTableReady: Promise<void> | null = null;

async function ensureCleanupTable(): Promise<void> {
  if (!cleanupTableReady) {
    cleanupTableReady = pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS deletion_queue (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          survey_id UUID NOT NULL,
          file_path TEXT,
          delete_after TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      )
      .then(() => undefined)
      .catch((error) => {
        cleanupTableReady = null;
        throw error;
      });
  }

  await cleanupTableReady;
}

export async function softDeleteSurveyAndQueueCleanup(
  surveyId: string,
): Promise<void> {
  await ensureCleanupTable();

  const { rows } = await pool.query<{ file_path: string | null }>(
    `SELECT file_path
       FROM survey_photos
      WHERE survey_id = $1`,
    [surveyId],
  );

  const deleteAfter = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO deletion_queue (survey_id, file_path, delete_after)
       VALUES ($1, $2, $3)`,
      [surveyId, null, deleteAfter],
    );
  } else {
    for (const row of rows) {
      await pool.query(
        `INSERT INTO deletion_queue (survey_id, file_path, delete_after)
         VALUES ($1, $2, $3)`,
        [surveyId, row.file_path, deleteAfter],
      );
    }
  }

  await pool.query(
    `UPDATE surveys
        SET deleted_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [surveyId],
  );
}

export async function processDeletionQueue(limit = 25): Promise<void> {
  await ensureCleanupTable();

  const { rows } = await pool.query<{
    id: string;
    survey_id: string;
    file_path: string | null;
  }>(
    `SELECT id, survey_id, file_path
       FROM deletion_queue
      WHERE delete_after <= NOW()
      ORDER BY delete_after ASC
      LIMIT $1`,
    [limit],
  );

  for (const row of rows) {
    if (row.file_path) {
      await deleteFile(row.file_path).catch((error) => {
        console.warn("Deferred file delete failed:", error);
      });
    }

    await pool.query("DELETE FROM deletion_queue WHERE id = $1", [row.id]);

    await pool.query("DELETE FROM survey_photos WHERE survey_id = $1", [row.survey_id]);
    await pool.query("DELETE FROM checklist_items WHERE survey_id = $1", [row.survey_id]);
    await pool.query("DELETE FROM ar_detections WHERE survey_id = $1", [row.survey_id]);
    await pool.query("DELETE FROM surveys WHERE id = $1 AND deleted_at IS NOT NULL", [row.survey_id]);
  }
}

export function startWebhookWorker(intervalMs = 30_000): void {
  if (workerHandle) return;

  workerHandle = setInterval(() => {
    processWebhookQueue().catch((error) => {
      console.error("Webhook queue processor error:", error);
    });
    processDeletionQueue().catch((error) => {
      console.error("Deletion queue processor error:", error);
    });
  }, intervalMs);
}

export function stopWebhookWorker(): void {
  if (!workerHandle) return;
  clearInterval(workerHandle);
  workerHandle = null;
}
