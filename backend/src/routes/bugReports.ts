import path from "path";
import { Router, Request, Response } from "express";
import multer from "multer";
import { pool } from "../database";
import { uploadFile } from "../utils/storageClient";

const router = Router();

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

      res.status(201).json({
        id: rows[0].id,
        screenshot_path: rows[0].screenshot_path,
        created_at: rows[0].created_at,
      });
    } catch (error) {
      console.error("POST /api/bug-reports error:", error);
      res.status(500).json({ error: "Failed to submit bug report" });
    }
  });
});

export default router;
