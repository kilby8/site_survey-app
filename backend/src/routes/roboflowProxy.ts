/**
 * roboflowProxy.ts
 *
 * Backend endpoint that proxies image inference requests to Roboflow cloud.
 * Keeps API key secure on backend, not exposed to mobile client.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { analyzeImage } from "../utils/roboflowClient";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPEG images are supported for inference"));
  },
});

/**
 * POST /api/roboflow/infer
 *
 * multipart/form-data:
 *   - file: JPEG image (max 2MB)
 *   - model_version: optional version override
 */
router.post("/infer", requireAuth, (req: Request, res: Response) => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Image exceeds 2MB limit" });
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

    try {
      const { model_version } = req.body as { model_version?: string };

      if (!req.file) {
        res.status(400).json({ error: "No image provided" });
        return;
      }

      if (
        req.file.mimetype !== "image/jpeg" &&
        req.file.mimetype !== "image/jpg"
      ) {
        res.status(415).json({
          error: "Only JPEG images are supported for inference",
        });
        return;
      }

      const optimizedBuffer = req.file.buffer;
      const result = await analyzeImage(optimizedBuffer, {
        modelId: model_version
          ? `${process.env.ROBOFLOW_MODEL_ID}/${model_version}`
          : undefined,
      });

      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Inference failed";
      console.error("Proxy Error:", message);
      res.status(500).json({ error: "Inference failed" });
    }
  });
});

export default router;
