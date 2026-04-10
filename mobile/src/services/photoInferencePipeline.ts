/**
 * photoInferencePipeline.ts
 *
 * End-to-end mobile pipeline using cloud inference:
 *  1) upload survey photos
 *  2) run cloud-based Roboflow inference per uploaded photo
 *  3) adapt inference output to AR detection payload format
 *  4) forward into AR detection workflow (processInference)
 */

import * as FileSystem from "expo-file-system";
import { inferSurveyPhoto, uploadPhotos } from "../api/client";
import {
  inferImageWithRoboflow,
  roboflowToPredictions,
} from "./roboflowCloudInference";
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

/**
 * Convert cloud Roboflow predictions to AR detection format.
 */
function predictionsToAR(
  electrical: Array<{ class: string; confidence: number; x: number; y: number; width: number; height: number }>,

  exterior: Array<{ class: string; confidence: number; x: number; y: number; width: number; height: number }>,
  roofType?: string,
): RoboflowInferenceResult {
  const allDetections = [...electrical, ...exterior];
  const trackIds = allDetections.map((_, i) => i + 1);

  return {
    electrical: electrical.map((e, i) => ({
      class: e.class,
      confidence: e.confidence,
      track_id: i + 1,
    })),
    exterior: exterior.map((e, i) => ({
      class: e.class,
      confidence: e.confidence,
      track_id: electrical.length + i + 1,
    })),
    distances: {},
    track_ids: trackIds,
    measurements: {},
    roof_type: roofType,
  };
}

/**
 * Uploads survey photos, runs cloud Roboflow inference, then forwards each
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
    if (!photo.file_path) continue;

    try {
      // Read the uploaded photo as base64
      const base64Image = await FileSystem.readAsStringAsync(
        photo.file_path,
        { encoding: FileSystem.EncodingType.Base64 },
      );

      // Send to Roboflow cloud for inference
      const roboflowResult = await inferImageWithRoboflow(
        base64Image,
        input.authToken,
      );

      // Convert cloud predictions to AR format
      const { electrical, exterior } = roboflowToPredictions(
        roboflowResult,
        minPredictionConfidence,
      );

      const adapted = predictionsToAR(electrical, exterior, input.roofType);

      if (adapted.track_ids.length < minTrackCountToSync) {
        skippedReasons.push({
          photoId: photo.id ?? photo.file_path,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      skippedReasons.push({
        photoId: photo.id ?? photo.file_path ?? "unknown",
        reason: `Cloud inference failed: ${message}`,
      });
    }
  }

  return {
    uploaded:
      typeof (uploadRes as UploadApiResponseShape).uploaded === "number"
        ? (uploadRes as UploadApiResponseShape).uploaded
        : uploadedPhotos.length,
    inferred: arResponses.length,
    synced: arResponses.length,
    skipped: skippedReasons.length,
    inferenceResponses,
    arResponses,
    skippedReasons,
  };
}
