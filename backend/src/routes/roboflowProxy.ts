/**
 * roboflowProxy.ts
 *
 * Backend endpoint that proxies image inference requests to Roboflow cloud.
 * Keeps API key secure on backend, not exposed to mobile client.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import {
  inferRoboflowFromBuffer,
  dataUrlToBuffer,
} from "../utils/roboflowClient";

const router = Router();

/**
 * POST /api/roboflow/infer
 *
 * Request body:
 *   - image: base64 data URL or raw base64 string
 *   - model_version: optional version override
 *
 * Response: Roboflow inference result (predictions, image dimensions, etc.)
 */
router.post("/infer", requireAuth, async (req: Request, res: Response) => {
  try {
    const { image, model_version } = req.body;

    if (!image) {
      res.status(400).json({ error: "Missing 'image' in request body" });
      return;
    }

    let imageBuffer: Buffer;
    try {
      // Try to parse as data URL first, fall back to raw base64
      imageBuffer = dataUrlToBuffer(image);
    } catch {
      try {
        imageBuffer = Buffer.from(image, "base64");
      } catch {
        res.status(400).json({
          error:
            "Invalid image format. Expected base64 string or data URL (data:image/...;base64,...)",
        });
        return;
      }
    }

    const result = await inferRoboflowFromBuffer(imageBuffer, {
      modelId: model_version ? `${process.env.ROBOFLOW_MODEL_ID}/${model_version}` : undefined,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inference failed";
    console.error("Roboflow inference error:", message);
    res.status(503).json({
      error: `Roboflow inference failed: ${message}`,
    });
  }
});

export default router;
