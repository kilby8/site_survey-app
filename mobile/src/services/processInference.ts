/**
 * processInference.ts
 *
 * Processes cloud Roboflow inference results and syncs them to the backend
 * as AR detections for storage and reporting.
 */

import { submitARDetection } from "../api/client";
import type {
  ARElectricalDetection,
  ARExteriorDetection,
} from "../types";

export interface RoboflowInferenceResult {
  /** Electrical component detections (panel, meter, disconnect, breaker…) */
  electrical: ARElectricalDetection[];
  /** Structural / exterior detections (brick, siding, conduit, weatherhead…) */
  exterior?: ARExteriorDetection[];
  /** Track IDs for detection tracking */
  track_ids: number[];
  /** Roof material type if determined by the model */
  roof_type?: string;
}

/**
 * Processes a single cloud Roboflow inference result and pushes it to
 * the backend via POST /api/surveys/:id/ar-detection.
 *
 * @param surveyId  - The UUID of the survey being inspected.
 * @param projectId - The project identifier to associate the detection with.
 * @param authToken - Bearer token for the authenticated inspector.
 * @param roboflowResult - Inference result from cloud Roboflow API.
 * @returns The API response, or null if there were no detections.
 */
export async function processInference(
  surveyId: string,
  projectId: string,
  authToken: string,
  roboflowResult: RoboflowInferenceResult,
): Promise<{ status: string; message: string } | null> {
  const {
    electrical,
    exterior,
    track_ids,
    roof_type,
  } = roboflowResult;

  // Only sync if there are actual detections
  if (track_ids.length === 0) {
    return null;
  }

  const result = await submitARDetection(
    surveyId,
    {
      project_id: projectId,
      electrical,
      exterior,
      track_ids,
      roof_type,
      timestamp: new Date().toISOString(),
    },
    authToken,
  );

  return result;
}
