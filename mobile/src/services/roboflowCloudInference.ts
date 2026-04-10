/**
 * roboflowCloudInference.ts
 *
 * Cloud-based Roboflow inference service.
 * Sends images to Roboflow cloud API instead of running local models.
 * All inference happens on Roboflow servers, no local ML on device.
 */

import { API_URL } from "../api/client";

export interface RoboflowCloudDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
  class_id?: number;
}

export interface RoboflowCloudInferenceResult {
  predictions: RoboflowCloudDetection[];
  image: {
    width: number;
    height: number;
  };
  time?: number;
}

/**
 * Send image to backend which will proxy it to Roboflow cloud.
 * Backend handles API key management and secrets.
 */
export async function inferImageWithRoboflow(
  base64Image: string,
  authToken: string,
  modelVersion: string = "1",
): Promise<RoboflowCloudInferenceResult> {
  const response = await fetch(`${API_URL}/api/roboflow/infer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      image: base64Image,
      model_version: modelVersion,
    }),
  });

  if (!response.ok) {
    let error = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      error = body.error || error;
    } catch {
      /* ignore */
    }
    throw new Error(`Roboflow inference failed: ${error}`);
  }

  return (await response.json()) as RoboflowCloudInferenceResult;
}

/**
 * Convert Roboflow predictions to AR detection format.
 */
export function roboflowToPredictions(
  result: RoboflowCloudInferenceResult,
  minConfidence = 0.6,
) {
  const electrical = result.predictions
    .filter((p) => p.confidence >= minConfidence)
    .filter((p) =>
      [
        "panel",
        "meter",
        "disconnect",
        "breaker",
        "msp",
        "main_service_panel",
      ].includes(p.class.toLowerCase()),
    )
    .map((p) => ({
      class: p.class,
      confidence: p.confidence,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
    }));

  const exterior = result.predictions
    .filter((p) => p.confidence >= minConfidence)
    .filter(
      (p) =>
        ![
          "panel",
          "meter",
          "disconnect",
          "breaker",
          "msp",
          "main_service_panel",
        ].includes(p.class.toLowerCase()),
    )
    .map((p) => ({
      class: p.class,
      confidence: p.confidence,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
    }));

  return { electrical, exterior };
}
