/**
 * processInference.ts
 *
 * Bridges the Roboflow AR inference pipeline to the Site Survey backend.
 *
 * Call this function once per inference result that comes off the model.
 * The `track_ids` guard ensures we only POST when ByteTracker has assigned
 * stable IDs — i.e. the model has locked onto real objects, not transient
 * detections at the edge of the camera frame.
 */

import { submitARDetection } from "../api/client";
import type {
  ARElectricalDetection,
  ARExteriorDetection,
  ARDistances,
  ARMeasurements,
} from "../types";

// ----------------------------------------------------------------
// Roboflow inference result shape
// ----------------------------------------------------------------

export interface RoboflowInferenceResult {
  /** Electrical component detections (panel, meter, disconnect, breaker…) */
  electrical: ARElectricalDetection[];
  /** Structural / exterior detections (brick, siding, conduit, weatherhead…) */
  exterior?: ARExteriorDetection[];
  /** Depth-anchored spatial distances from the Depth Estimation model */
  distances?: ARDistances;
  /** Active ByteTracker IDs — non-empty only when tracks are stable */
  track_ids: number[];
  /** Optional measured values captured during the session */
  measurements?: ARMeasurements;
  /** Roof material type if determined by the model */
  roof_type?: string;
}

// ----------------------------------------------------------------
// processInference
// ----------------------------------------------------------------

/**
 * Processes a single Roboflow inference result and pushes it to the
 * web pipeline via POST /api/surveys/:id/ar-detection.
 *
 * @param surveyId  - The UUID of the survey being inspected.
 * @param projectId - The project identifier to associate the detection with.
 * @param authToken - Bearer token for the authenticated inspector.
 * @param roboflowResult - Raw output from the AR/Roboflow inference model.
 * @returns The API response, or null if the guard condition was not met.
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
    distances,
    track_ids,
    measurements,
    roof_type,
  } = roboflowResult;

  // Only sync when ByteTracker has assigned stable IDs — prevents
  // redundant or noise-only updates during a live AR session.
  if (track_ids.length === 0) {
    return null;
  }

  const result = await submitARDetection(
    surveyId,
    {
      project_id: projectId,
      electrical,
      exterior,
      distances,
      track_ids,
      measurements,
      roof_type,
      timestamp: new Date().toISOString(),
    },
    authToken,
  );

  return result;
}
