import path from "path";
import fs from "fs";

// Load .env before anything else
if (process.env.NODE_ENV !== "production") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  } catch {
    /* dotenv optional */
  }
}

import express, { type Request } from "express";
import cors from "cors";
import multer from "multer";
import surveysRouter, { ensureSurveySoftDeleteColumn } from "./routes/surveys";
import categoriesRouter from "./routes/categories";
import usersRouter from "./routes/users";

import handoffRouter from "./routes/handoff";
import fallbackSurveyRouter from "./routes/fallbackSurvey";
import openApiRouter from "./routes/openapi";
import bugReportsRouter from "./routes/bugReports";
import mobileClientsRouter from "./routes/mobileClients";
import webhooksRouter from "./routes/webhooks";
import { buildTestingReleasePage } from "./views/testingReleasePage";
import { requireAuth } from "./middleware/auth";
import { adminOverrideDebug } from "./middleware/adminOverrideDebug";
import { pool } from "./database";
import { uploadFile, isS3Mode } from "./utils/storageClient";
import { startWebhookWorker } from "./services/webhookService";
import { startSqlServerSyncWorker } from "./services/sqlServerSyncService";
import { startPhotoRetentionScheduleWorker } from "./services/photoRetentionScheduleService";
import {
  incrementMetric,
  recordTiming,
  getMetricsSnapshot,
} from "./services/metrics";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID || "com.sitesurvey.mobile";
const APPLE_TEAM_ID = (process.env.APPLE_TEAM_ID || "").trim();

// Only create local uploads dir when not using S3
if (!isS3Mode() && !fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Use memory storage â€” storageClient handles the final destination
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files are allowed"));
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// ----------------------------------------------------------------
// CORS
// ----------------------------------------------------------------
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173,http://localhost:4173,http://localhost:8081"
)
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ----------------------------------------------------------------
// Body parsing
// ----------------------------------------------------------------
app.use(express.json({
  limit: "50mb",
  verify: (req, _res, buffer) => {
    (req as Request & { rawBody?: string }).rawBody = buffer.toString("utf8");
  },
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    incrementMetric("api_requests_total");
    recordTiming("http_request_duration_ms", durationMs);

    console.info(
      JSON.stringify({
        type: "http_request",
        request_id: requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: durationMs,
      }),
    );
  });

  next();
});

// ----------------------------------------------------------------
// Public landing page
// ----------------------------------------------------------------
app.get("/.well-known/apple-app-site-association", (_req, res) => {
  const appID = APPLE_TEAM_ID
    ? `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`
    : IOS_BUNDLE_ID;

  res.type("application/json").send({
    applinks: {
      apps: [],
      details: [
        {
          appID,
          paths: ["/view/*"],
        },
      ],
    },
  });
});

app.use(express.static(PUBLIC_DIR));

app.get("/view/:surveyId", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/admin", (_req, res) => {
  res.redirect(302, "https://solar-pro.app/");
});

app.get("/admin/home", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin-home.html"));
});

app.get("/admin/surveys", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin-surveys.html"));
});

app.get("/admin/bug-reports", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin-bug-reports.html"));
});

app.get("/tools/map-simulator", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "map-simulator.html"));
});

app.get("/admin/pipeline-topology", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "pipeline-topology.html"));
});

app.get("/release/latest.apk", (_req, res) => {
  const apkUrl = process.env.LATEST_APP_APK_URL?.trim();
  const releasePageUrl = process.env.LATEST_APP_RELEASE_URL?.trim() || "https://github.com/kilby8/site_survey-app/releases/latest";

  res.redirect(302, apkUrl || releasePageUrl);
});

app.get(["/release", "/download", "/release/latest"], (_req, res) => {
  const releasePageUrl = process.env.LATEST_APP_RELEASE_URL?.trim() || "https://github.com/kilby8/site_survey-app/releases/latest";
  const versionLabel = process.env.LATEST_APP_VERSION?.trim() || "Latest testing build";

  res.type("html").send(
    buildTestingReleasePage({
      apkUrl: "/release/latest.apk",
      releasePageUrl,
      versionLabel,
      updatedAt: new Date().toISOString(),
      directLinkConfigured: Boolean(process.env.LATEST_APP_APK_URL?.trim()),
    }),
  );
});

app.use(fallbackSurveyRouter);

// ----------------------------------------------------------------
// Serve uploaded photos statically
// ----------------------------------------------------------------
// Serve uploaded photos statically â€” local mode only
// ----------------------------------------------------------------
if (!isS3Mode()) {
  app.use("/uploads", express.static(UPLOADS_DIR));
}

// ----------------------------------------------------------------
// Health check
// ----------------------------------------------------------------
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "error",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

// ----------------------------------------------------------------
// Survey image upload
// ----------------------------------------------------------------
app.post("/api/surveys/upload", requireAuth, (req, res) => {
  upload.single("image")(req, res, async (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Image exceeds 10MB limit" });
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
      res.status(400).json({ error: "No image file uploaded" });
      return;
    }

    try {
      const ext = require("path").extname(req.file.originalname) || ".jpg";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const filePath = await uploadFile(req.file.buffer, filename, req.file.mimetype);
      res.status(201).json({ filePath });
    } catch (uploadErr) {
      const message = uploadErr instanceof Error ? uploadErr.message : "Upload failed";
      res.status(500).json({ error: message });
    }
  });
});

app.get("/api/metrics", requireAuth, (req, res) => {
  if (req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  res.json(getMetricsSnapshot());
});

// ----------------------------------------------------------------
// API routes
// ----------------------------------------------------------------
app.use("/api/webhooks", webhooksRouter);

// Public photo serving — no auth required.
// Photos are identified by UUID (unguessable). Must be registered BEFORE
// the requireAuth middleware on /api/surveys so the route is reachable
// without a Bearer token (SolarPro fetches photo URLs directly).
app.get("/api/surveys/photos/:photoId", async (req, res) => {
  await ensureSurveySoftDeleteColumn();

  const { photoId } = req.params;
  if (!photoId || !/^[0-9a-f-]{36}$/i.test(photoId)) {
    res.status(400).json({ error: "Invalid photo id" });
    return;
  }
  try {
    const { rows } = await pool.query(
      "SELECT photo_data, mime_type, filename FROM survey_photos WHERE id = $1 LIMIT 1",
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
    res.setHeader("Content-Type", row.mime_type || "image/jpeg");
    res.setHeader("Content-Length", row.photo_data.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Disposition", `inline; filename="${row.filename || "photo.jpg"}"`);
    res.send(row.photo_data);
  } catch (err) {
    console.error("[GET /api/surveys/photos/:photoId]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.use("/api/surveys", requireAuth, adminOverrideDebug, surveysRouter);
app.use("/api/categories", requireAuth, categoriesRouter);
app.use("/api/users", usersRouter);
app.use("/api/handoff", handoffRouter);
app.use("/api", openApiRouter);
app.use("/api/bug-reports", requireAuth, bugReportsRouter);
app.use("/api/mobile", requireAuth, mobileClientsRouter);


// ----------------------------------------------------------------
// SolarPro SSO bridge — receives HTTPS redirect from SolarPro OAuth
// and bounces the browser into the sitesurvey:// deep link so the
// native app can finish the handshake.
// ----------------------------------------------------------------
app.get("/auth/callback", (req, res) => {
  const token = req.query.token as string | undefined;
  const state = req.query.state as string | undefined;
  const scheme = req.query.scheme as string | undefined;

  if (!token || !state) {
    res.status(400).send(
      "<!DOCTYPE html><html><body><p>Missing token or state. Please try logging in again.</p></body></html>",
    );
    return;
  }

  // Determine the scheme to use for the deeplink
  // Priority: query param > Expo Go detection > production default
  let targetScheme = scheme || "sitesurvey";

  // If no explicit scheme provided, try to detect Expo Go
  if (!scheme) {
    const userAgent = req.headers["user-agent"] || "";
    if (userAgent.includes("Expo") || userAgent.includes("ExpoGo")) {
      targetScheme = "exp";
    }
  }

  // Sanitise — both values are URL-encoded back into the deep link
  const safeToken = encodeURIComponent(token);
  const safeState = encodeURIComponent(state);
  const deepLink = `${targetScheme}://login?token=${safeToken}&state=${safeState}`;

  console.log(`[AUTH_CALLBACK] Redirecting to deeplink: ${targetScheme}://login`);
  console.log(`[AUTH_CALLBACK] User-Agent: ${req.headers["user-agent"]}`);

  res.send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Opening Site Survey…</title>
    <meta http-equiv="refresh" content="0;url=${deepLink}" />
    <script>
      // Try the configured scheme
      window.location.replace(${JSON.stringify(deepLink)});

      // Fallback: If the redirect doesn't work after 3 seconds, try exp:// alternative
      setTimeout(() => {
        const fallbackDeepLink = ${JSON.stringify(`exp://login?token=${safeToken}&state=${safeState}`)};
        if (${JSON.stringify(targetScheme)} !== 'exp') {
          window.location.replace(fallbackDeepLink);
        }
      }, 3000);
    </script>
  </head>
  <body>
    <p>Redirecting back to the app…</p>
    <p>If the app does not open, <a href="${deepLink}">tap here</a>.</p>
    ${targetScheme !== "exp" ? `<p><a href="exp://login?token=${safeToken}&state=${safeState}">Or try Expo Go</a>.</p>` : ""}
  </body>
</html>`);
});

// ----------------------------------------------------------------
// 404
// ----------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ----------------------------------------------------------------
// Start server
// ----------------------------------------------------------------
if (require.main === module) {
  // Validate all load-bearing env vars before accepting any traffic.
  // Server will exit(1) with a clear message if anything critical is missing.
  const { runEnvGuard } = require("./lib/envGuard");
  runEnvGuard();

  app.listen(PORT, () => {
    console.log(`Site Survey API running on http://localhost:${PORT}`);
    console.log(`Photo uploads served from /uploads`);
    startWebhookWorker();
    startSqlServerSyncWorker();
    startPhotoRetentionScheduleWorker();
  });
}

export default app;
