import { pool } from "../database";

export interface RoboflowPrediction {
  class: string;
  confidence: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  class_id?: number;
}

export interface SurveyMetadata {
  surveyId: string;
  projectId?: string;
  roofType?: string;
  capturedAt?: string;
  gps?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
}

interface PersistedDetection {
  class: string;
  feature_type: string;
  confidence: number;
  track_id: number;
  bbox: {
    x: number | null;
    y: number | null;
    width: number | null;
    height: number | null;
  };
  coordinates: {
    x: number | null;
    y: number | null;
  };
}

const ELECTRICAL_CLASSES = new Set([
  "panel",
  "meter",
  "disconnect",
  "breaker",
  "msp",
  "main_service_panel",
]);

function mapClassToFeatureType(className: string): string {
  const normalized = className.toLowerCase();

  if (ELECTRICAL_CLASSES.has(normalized)) {
    return "electrical";
  }

  if (["roof", "shingle", "tile", "metal_roof"].includes(normalized)) {
    return "roof";
  }

  if (["conduit", "weatherhead", "service_drop"].includes(normalized)) {
    return "electrical_exterior";
  }

  return "exterior";
}

function normalizePredictions(
  predictions: RoboflowPrediction[],
): PersistedDetection[] {
  return predictions.map((prediction, index) => ({
    class: prediction.class,
    feature_type: mapClassToFeatureType(prediction.class),
    confidence: prediction.confidence,
    track_id: index + 1,
    bbox: {
      x: typeof prediction.x === "number" ? prediction.x : null,
      y: typeof prediction.y === "number" ? prediction.y : null,
      width: typeof prediction.width === "number" ? prediction.width : null,
      height: typeof prediction.height === "number" ? prediction.height : null,
    },
    coordinates: {
      x: typeof prediction.x === "number" ? prediction.x : null,
      y: typeof prediction.y === "number" ? prediction.y : null,
    },
  }));
}

/**
 * Persists normalized Roboflow predictions and optional survey GPS metadata.
 *
 * - Prediction classes are mapped to a feature type.
 * - Detection coordinates (x/y + bbox) are stored in JSON payloads.
 * - When GPS metadata is provided, survey location is updated using PostGIS:
 *   ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
 */
export async function persistSurveyData(
  predictions: RoboflowPrediction[],
  metadata: SurveyMetadata,
): Promise<void> {
  if (!metadata.surveyId) {
    throw new Error("surveyId is required to persist inference data");
  }

  const normalized = normalizePredictions(predictions);
  const electrical = normalized.filter((d) => d.feature_type === "electrical");
  const exterior = normalized.filter((d) => d.feature_type !== "electrical");
  const trackIds = normalized.map((d) => d.track_id);
  const detectedAt = metadata.capturedAt ? new Date(metadata.capturedAt) : new Date();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO ar_detections
         (survey_id, project_id, electrical, exterior, distances, track_ids,
          measurements, roof_type, detected_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        metadata.surveyId,
        metadata.projectId ?? null,
        JSON.stringify(electrical),
        JSON.stringify(exterior),
        JSON.stringify({}),
        JSON.stringify(trackIds),
        JSON.stringify({}),
        metadata.roofType ?? null,
        detectedAt,
      ],
    );

    if (
      metadata.gps &&
      Number.isFinite(metadata.gps.lat) &&
      Number.isFinite(metadata.gps.lng)
    ) {
      await client.query(
        `UPDATE surveys
            SET latitude = $1,
                longitude = $2,
                gps_accuracy = $3,
                location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                updated_at = NOW()
          WHERE id = $4`,
        [
          metadata.gps.lat,
          metadata.gps.lng,
          metadata.gps.accuracy ?? null,
          metadata.surveyId,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
