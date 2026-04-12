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
 * Send optimized JPEG image URI to backend which proxies to Roboflow cloud.
 */
export async function inferImageWithRoboflow(
  optimizedImageUri: string,
  authToken: string,
  modelVersion: string = "1",
): Promise<RoboflowCloudInferenceResult> {
  const formData = new FormData();
  formData.append("file", {
    uri: optimizedImageUri,
    name: "survey_photo.jpg",
    type: "image/jpeg",
  } as never);
  formData.append("model_version", modelVersion);

  const response = await fetch(`${API_URL}/api/roboflow/infer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    body: formData,
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
