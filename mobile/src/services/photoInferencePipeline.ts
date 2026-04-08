/**
 * photoInferencePipeline.ts
 *
 * End-to-end mobile pipeline:
 *  1) upload survey photos
 *  2) trigger backend Roboflow inference per uploaded photo
 *  3) adapt inference output to AR detection payload format
 *  4) forward into AR detection workflow (processInference)
 */

import { inferSurveyPhoto, uploadPhotos } from "../api/client";
import type {
  ARDistances,
  ARExteriorDetection,
  ARElectricalDetection,
  ARMeasurements,
  PhotoInferenceRequest,
  PhotoInferenceResponse,
} from "../types";
import {
  processInference,
  type RoboflowInferenceResult,
} from "./processInference";

const ELECTRICAL_CLASSES = new Set([
  "panel",
  "meter",
  "disconnect",
  "breaker",
  "msp",
  "main_service_panel",
]);

const DEFAULT_MIN_PREDICTION_CONFIDENCE = 0.6;

type UploadedPhotoRecord = {
  id?: string;
  file_path?: string;
  filename?: string;
  label?: string;
};

type UploadApiResponseShape = {
  uploaded: number;
  photos: UploadedPhotoRecord[];
};

export interface UploadInferSyncInput {
  surveyId: string;
  projectId: string;
  authToken: string;
  photos: Array<{ uri: string; label: string; mimeType?: string }>;
  inference?: PhotoInferenceRequest;
  roofType?: string;
  minPredictionConfidence?: number;
  minTrackCountToSync?: number;
}

export interface UploadInferSyncResult {
  uploaded: number;
  inferred: number;
  synced: number;
  skipped: number;
  inferenceResponses: PhotoInferenceResponse[];
  arResponses: Array<{ status: string; message: string }>;
  skippedReasons: Array<{ photoId: string; reason: string }>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeConfidenceThreshold(
  value: number | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value > 1) {
    return Math.min(Math.max(value / 100, 0), 1);
  }

  return Math.min(Math.max(value, 0), 1);
}

function adaptInferenceToAR(
  inference: unknown,
  roofType?: string,
  minPredictionConfidence = 0,
): RoboflowInferenceResult {
  const root = (
    inference && typeof inference === "object"
      ? (inference as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;

  // Supports both plain model response and workflow response shapes.
  // Example workflow shape: { outputs: [{ predictions: [...] }] }
  const workflowOutput = Array.isArray(root.outputs)
    ? (root.outputs[0] as Record<string, unknown> | undefined)
    : undefined;
  const nestedResult =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : undefined;

  const predictionsSource =
    (Array.isArray(root.predictions) && root) ||
    (workflowOutput && Array.isArray(workflowOutput.predictions)
      ? workflowOutput
      : undefined) ||
    (nestedResult && Array.isArray(nestedResult.predictions)
      ? nestedResult
      : undefined);

  const predictions = predictionsSource
    ? (predictionsSource.predictions as Array<Record<string, unknown>>)
    : [];

  const electrical: ARElectricalDetection[] = [];
  const exterior: ARExteriorDetection[] = [];
  const trackIds = new Set<number>();

  for (let i = 0; i < predictions.length; i += 1) {
    const p = predictions[i] ?? {};
    const classLabel = typeof p.class === "string" ? p.class : "unknown";
    const confidence = asNumber(p.confidence) ?? 0;
    if (confidence < minPredictionConfidence) {
      continue;
    }
    const depth = asNumber(p.depth_m ?? p.depth ?? p.distance);
    const trackId =
      asNumber(p.track_id ?? p.tracker_id ?? p.trackId ?? p.id) ?? i + 1;

    const common = {
      class: classLabel,
      confidence,
      track_id: Math.trunc(trackId),
      ...(depth !== null ? { depth_m: depth } : {}),
    };

    trackIds.add(common.track_id);

    if (ELECTRICAL_CLASSES.has(classLabel.toLowerCase())) {
      electrical.push(common);
    } else {
      exterior.push(common);
    }
  }

  const distancesSource =
    (root.distances && typeof root.distances === "object" && root.distances) ||
    (workflowOutput?.distances && typeof workflowOutput.distances === "object"
      ? workflowOutput.distances
      : undefined) ||
    (nestedResult?.distances && typeof nestedResult.distances === "object"
      ? nestedResult.distances
      : undefined);

  const distances: ARDistances = distancesSource
    ? (distancesSource as ARDistances)
    : {};

  const measurementsSource =
    (root.measurements &&
      typeof root.measurements === "object" &&
      root.measurements) ||
    (workflowOutput?.measurements &&
    typeof workflowOutput.measurements === "object"
      ? workflowOutput.measurements
      : undefined) ||
    (nestedResult?.measurements && typeof nestedResult.measurements === "object"
      ? nestedResult.measurements
      : undefined);

  const measurements: ARMeasurements = measurementsSource
    ? (measurementsSource as ARMeasurements)
    : {};

  return {
    electrical,
    exterior,
    distances,
    track_ids: Array.from(trackIds),
    measurements,
    roof_type: roofType,
  };
}

/**
 * Uploads survey photos, runs backend inference, then forwards each
 * inference result into AR detection sync.
 */
export async function uploadInferAndSyncSurveyPhotos(
  input: UploadInferSyncInput,
): Promise<UploadInferSyncResult> {
  const uploadRes = (await uploadPhotos(input.surveyId, input.photos)) as
    | UploadApiResponseShape
    | Record<string, unknown>;

  const uploadedPhotos = Array.isArray(
    (uploadRes as UploadApiResponseShape).photos,
  )
    ? (uploadRes as UploadApiResponseShape).photos
    : [];

  const inferenceResponses: PhotoInferenceResponse[] = [];
  const arResponses: Array<{ status: string; message: string }> = [];
  const skippedReasons: Array<{ photoId: string; reason: string }> = [];

  const minPredictionConfidence =
    normalizeConfidenceThreshold(input.minPredictionConfidence) ??
    normalizeConfidenceThreshold(input.inference?.confidence) ??
    DEFAULT_MIN_PREDICTION_CONFIDENCE;
  const minTrackCountToSync =
    typeof input.minTrackCountToSync === "number"
      ? Math.max(0, Math.trunc(input.minTrackCountToSync))
      : 1;

  for (const photo of uploadedPhotos) {
    if (!photo.id) continue;

    const inferRes = await inferSurveyPhoto(
      input.surveyId,
      photo.id,
      input.authToken,
      input.inference ?? {},
    );
    inferenceResponses.push(inferRes);

    const adapted = adaptInferenceToAR(
      inferRes.inference,
      input.roofType,
      minPredictionConfidence,
    );

    if (adapted.track_ids.length < minTrackCountToSync) {
      skippedReasons.push({
        photoId: photo.id,
        reason:
          adapted.track_ids.length === 0
            ? `No detections met the confidence threshold (${Math.round(minPredictionConfidence * 100)}%)`
            : `Only ${adapted.track_ids.length} detection(s) met the confidence threshold (${Math.round(minPredictionConfidence * 100)}%)`,
      });
      continue;
    }

    const arRes = await processInference(
      input.surveyId,
      input.projectId,
      input.authToken,
      adapted,
    );

    if (arRes) {
      arResponses.push(arRes);
    }
  }

  return {
    uploaded:
      typeof (uploadRes as UploadApiResponseShape).uploaded === "number"
        ? (uploadRes as UploadApiResponseShape).uploaded
        : uploadedPhotos.length,
    inferred: inferenceResponses.length,
    synced: arResponses.length,
    skipped: skippedReasons.length,
    inferenceResponses,
    arResponses,
    skippedReasons,
  };
}
