import path from "path";
import { Router, Request, Response } from "express";
import multer from "multer";
import nodemailer from "nodemailer";
import { pool } from "../database";
import { uploadFile } from "../utils/storageClient";

const router = Router();

const ADMIN_EMAIL_OVERRIDES = new Set(["carpenterjames88@gmail.com", "carpj88@outlook.com"]);

function cleanEmail(email?: string): string {
  return (email || "").trim().toLowerCase();
}

function isAdminRequest(req: Request): boolean {
  const email = cleanEmail(req.authUser?.email);
  return req.authUser?.role === "admin" || ADMIN_EMAIL_OVERRIDES.has(email);
}

function getBugReportAdminEmail(): string {
  return (
    process.env.BUG_REPORT_ADMIN_EMAIL?.trim()
    || process.env.ADMIN_EMAIL?.trim()
    || "carpenterjames88@gmail.com"
  );
}

function readBugReportMailerConfig() {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const portRaw = parseInt(process.env.SMTP_PORT || "587", 10);
  const port = Number.isFinite(portRaw) ? portRaw : 587;
  const user = process.env.SMTP_USER?.trim() || undefined;
  const pass = process.env.SMTP_PASSWORD?.trim() || undefined;
  const sender = process.env.SMTP_SENDER?.trim() || "noreply@solardb.local";
  const requireTls = (process.env.SMTP_USE_TLS || "true").trim().toLowerCase() === "true";

  return { host, port, user, pass, sender, requireTls };
}

async function sendBugReportAdminEmail(payload: {
  id: string;
  reporterEmail: string | null;
  title: string | null;
  description: string | null;
  screenshotPath: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}): Promise<void> {
  const mailConfig = readBugReportMailerConfig();
  if (!mailConfig) {
    return;
  }

  const adminEmail = getBugReportAdminEmail();
  if (!adminEmail) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: false,
    requireTLS: mailConfig.requireTls,
    auth: mailConfig.user && mailConfig.pass ? { user: mailConfig.user, pass: mailConfig.pass } : undefined,
  });

  await transporter.verify();

  const metadataPretty = JSON.stringify(payload.metadata || {}, null, 2);

  await transporter.sendMail({
    from: mailConfig.sender,
    to: adminEmail,
    subject: `New Site Survey bug report ${payload.id}`,
    text: [
      `Bug report ID: ${payload.id}`,
      `Reporter: ${payload.reporterEmail || "unknown"}`,
      `Title: ${payload.title || "(none)"}`,
      `Description: ${payload.description || "(none)"}`,
      `Screenshot: ${payload.screenshotPath}`,
      `Created: ${payload.createdAt}`,
      "",
      "Metadata:",
      metadataPretty,
    ].join("\n"),
    html: [
      `<p><strong>Bug report ID:</strong> ${payload.id}</p>`,
      `<p><strong>Reporter:</strong> ${payload.reporterEmail || "unknown"}</p>`,
      `<p><strong>Title:</strong> ${payload.title || "(none)"}</p>`,
      `<p><strong>Description:</strong> ${payload.description || "(none)"}</p>`,
      `<p><strong>Screenshot:</strong> <a href="${payload.screenshotPath}">${payload.screenshotPath}</a></p>`,
      `<p><strong>Created:</strong> ${payload.createdAt}</p>`,
      `<pre>${metadataPretty.replace(/</g, "&lt;")}</pre>`,
    ].join(""),
  });
}

let tableReady: Promise<void> | null = null;

async function ensureBugReportsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS bug_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT,
          user_email TEXT,
          title TEXT,
          description TEXT,
          screenshot_path TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files are allowed"));
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.get("/admin", async (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  await ensureBugReportsTable();

  const limitRaw = parseInt(String(req.query.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
  const offsetRaw = parseInt(String(req.query.offset || "0"), 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  try {
    const [{ rows: reports }, { rows: countRows }] = await Promise.all([
      pool.query<{
        id: string;
        user_id: string | null;
        user_email: string | null;
        title: string | null;
        description: string | null;
        screenshot_path: string | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `SELECT
           id::text,
           user_id,
           user_email,
           title,
           description,
           screenshot_path,
           metadata,
           created_at::text
         FROM bug_reports
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      pool.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM bug_reports`),
    ]);

    res.json({
      reports,
      total: Number(countRows[0]?.total || 0),
      limit,
      offset,
    });
  } catch (error) {
    console.error("GET /api/bug-reports/admin error:", error);
    res.status(500).json({ error: "Failed to load bug reports" });
  }
});

router.post("/", (req: Request, res: Response) => {
  upload.single("screenshot")(req, res, async (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Screenshot exceeds 20MB limit" });
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

    if (!req.file) {
      res.status(400).json({ error: "screenshot is required" });
      return;
    }

    try {
      await ensureBugReportsTable();

      const ext = path.extname(req.file.originalname) || ".jpg";
      const filename = `bug-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const screenshotPath = await uploadFile(
        req.file.buffer,
        filename,
        req.file.mimetype,
      );

      const title =
        typeof req.body.title === "string" ? req.body.title.trim() : "";
      const description =
        typeof req.body.description === "string"
          ? req.body.description.trim()
          : "";

      let metadata: Record<string, unknown> = {};
      if (typeof req.body.metadata === "string" && req.body.metadata.trim()) {
        try {
          const parsed = JSON.parse(req.body.metadata) as Record<string, unknown>;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            metadata = parsed;
          }
        } catch {
          metadata = {};
        }
      }

      const { rows } = await pool.query<{
        id: string;
        screenshot_path: string;
        created_at: string;
      }>(
        `INSERT INTO bug_reports
           (user_id, user_email, title, description, screenshot_path, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id::text, screenshot_path, created_at::text`,
        [
          req.authUser?.userId ?? null,
          req.authUser?.email ?? null,
          title || null,
          description || null,
          screenshotPath,
          JSON.stringify(metadata),
        ],
      );

      const created = rows[0];

      await sendBugReportAdminEmail({
        id: created.id,
        reporterEmail: req.authUser?.email ?? null,
        title: title || null,
        description: description || null,
        screenshotPath: created.screenshot_path,
        metadata,
        createdAt: created.created_at,
      }).catch((mailErr) => {
        console.error("Bug report admin email failed:", mailErr);
      });

      res.status(201).json({
        id: created.id,
        screenshot_path: created.screenshot_path,
        created_at: created.created_at,
      });
    } catch (error) {
      console.error("POST /api/bug-reports error:", error);
      res.status(500).json({ error: "Failed to submit bug report" });
    }
  });
});

export default router;
