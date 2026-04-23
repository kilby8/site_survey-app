import { Router, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { pool } from "../database";

const router = Router();

interface SurveyCompletedWebhookBody {
  event: "survey.completed";
  event_id: string;
  occurred_at: string;
  survey_id: string;
  status?: string;
  completed_at: string;
}

let inboundTableReady: Promise<void> | null = null;

async function ensureInboundWebhookTable(): Promise<void> {
  if (!inboundTableReady) {
    inboundTableReady = pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS webhook_inbound_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          survey_id TEXT,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      )
      .then(() => undefined)
      .catch((error) => {
        inboundTableReady = null;
        throw error;
      });
  }

  await inboundTableReady;
}

function getWebhookSecret(): string | null {
  const secret = process.env.SURVEY_WEBHOOK_SECRET?.trim();
  return secret || null;
}

function parseTimestamp(value: string): number | null {
  const trimmed = value.trim();
  const ms = Date.parse(trimmed);
  if (Number.isFinite(ms)) return ms;
  return null;
}

function withinReplayWindow(timestamp: string, windowMs = 5 * 60 * 1000): boolean {
  const parsed = parseTimestamp(timestamp);
  if (parsed === null) return false;
  return Math.abs(Date.now() - parsed) <= windowMs;
}

function buildDigest(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function signaturesMatch(expectedHex: string, received: string): boolean {
  const normalized = received.startsWith("sha256=")
    ? received.slice("sha256=".length)
    : received;

  if (!/^[a-f0-9]{64}$/.test(normalized)) return false;

  const expectedBuffer = Buffer.from(expectedHex, "hex");
  const receivedBuffer = Buffer.from(normalized, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function validateBody(body: unknown): body is SurveyCompletedWebhookBody {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;

  return (
    candidate.event === "survey.completed" &&
    typeof candidate.event_id === "string" &&
    candidate.event_id.trim().length > 0 &&
    typeof candidate.occurred_at === "string" &&
    candidate.occurred_at.trim().length > 0 &&
    typeof candidate.survey_id === "string" &&
    candidate.survey_id.trim().length > 0 &&
    typeof candidate.completed_at === "string" &&
    candidate.completed_at.trim().length > 0
  );
}

router.post("/survey-complete", async (req: Request, res: Response) => {
  try {
    const secret = getWebhookSecret();
    if (!secret) {
      res.status(500).json({
        error: {
          code: "SERVER_MISCONFIGURED",
          message: "SURVEY_WEBHOOK_SECRET is not configured",
        },
      });
      return;
    }

    const signature = req.header("X-Survey-Signature")?.trim() || "";
    const timestamp = req.header("X-Survey-Timestamp")?.trim() || "";
    const eventIdHeader = req.header("X-Survey-Event-Id")?.trim() || "";

    if (!signature || !timestamp || !eventIdHeader) {
      res.status(401).json({
        error: {
          code: "SIGNATURE_HEADERS_MISSING",
          message: "Missing required signature headers",
        },
      });
      return;
    }

    if (!withinReplayWindow(timestamp)) {
      res.status(401).json({
        error: {
          code: "TIMESTAMP_OUT_OF_WINDOW",
          message: "Timestamp is outside replay protection window",
        },
      });
      return;
    }

    const rawBody = (req as Request & { rawBody?: string }).rawBody;
    if (typeof rawBody !== "string") {
      res.status(400).json({
        error: {
          code: "RAW_BODY_UNAVAILABLE",
          message: "Raw body is required for signature verification",
        },
      });
      return;
    }

    const expected = buildDigest(secret, timestamp, rawBody);
    if (!signaturesMatch(expected, signature)) {
      res.status(401).json({
        error: {
          code: "SIGNATURE_MISMATCH",
          message: "Invalid survey webhook signature",
        },
      });
      return;
    }

    if (!validateBody(req.body)) {
      res.status(400).json({
        error: {
          code: "INVALID_PAYLOAD",
          message: "Webhook body does not match survey.completed schema",
        },
      });
      return;
    }

    if (req.body.event_id !== eventIdHeader) {
      res.status(400).json({
        error: {
          code: "EVENT_ID_MISMATCH",
          message: "Header event id does not match payload event_id",
        },
      });
      return;
    }

    await ensureInboundWebhookTable();

    try {
      await pool.query(
        `INSERT INTO webhook_inbound_events (event_id, event_type, survey_id)
         VALUES ($1, $2, $3)`,
        [req.body.event_id, req.body.event, req.body.survey_id],
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === "23505") {
        res.status(200).json({
          ok: true,
          duplicate: true,
          event_id: req.body.event_id,
        });
        return;
      }
      throw error;
    }

    const acceptPreIngest202 = process.env.WEBHOOK_PRE_INGEST_ACCEPT_202 === "true";
    if (acceptPreIngest202) {
      res.status(202).json({
        ok: true,
        code: "ACCEPTED_PRE_INGEST",
        event_id: req.body.event_id,
      });
      return;
    }

    res.status(501).json({
      ok: true,
      error: {
        code: "INGEST_NOT_IMPLEMENTED",
        message: "Webhook validated and logged, ingest pipeline not enabled",
      },
      event_id: req.body.event_id,
    });
  } catch (error) {
    console.error("POST /api/webhooks/survey-complete error:", error);
    res.status(500).json({
      error: {
        code: "WEBHOOK_RECEIVER_FAILED",
        message: "Failed to process survey webhook",
      },
    });
  }
});

export default router;
