/**
 * arDetectionService.ts
 *
 * Client-side AR detection state manager for the mobile app.
 *
 * Responsibilities:
 *  1. Maintain a stable map of ByteTracker track_id → detected object so
 *     that AR labels stay anchored to the same physical component (MSP,
 *     meter, breaker…) even when the camera pans away and returns.
 *  2. Accumulate exterior / structural detections and depth-based distances
 *     as the inspector moves around the panel.
 *  3. On session commit (user taps "Save AR Scan") build the structured
 *     payload and call POST /api/surveys/:id/ar-detection via the API
 *     client.
 *
 * Usage:
 *   const session = createARDetectionSession(surveyId, projectId, token);
 *   session.updateFrame(electricalDetections, exteriorDetections);
 *   session.setDistance('meter_to_panel_distance', '1.5m');
 *   const result = await session.commit({ roof_type: 'shingle' });
 */

import { submitARDetection, fetchARDetections } from "../api/client";
import type {
  ARElectricalDetection,
  ARExteriorDetection,
  ARDetectionPayload,
  ARDetectionResponse,
  ARDetectionListResponse,
  ARDistances,
  ARMeasurements,
} from "../types";

// ----------------------------------------------------------------
// Internal track registries
// ----------------------------------------------------------------

/** Latest known state for a tracked electrical object. */
interface ElectricalTrack extends ARElectricalDetection {
  last_seen_at: number; // Date.now() timestamp
}

/** Latest known state for a tracked exterior object. */
interface ExteriorTrack extends ARExteriorDetection {
  last_seen_at: number;
}

/** Milliseconds a track is kept alive after its last detection frame. */
const TRACK_TTL_MS = 10_000;

// ----------------------------------------------------------------
// Session factory
// ----------------------------------------------------------------

export interface ARDetectionSession {
  /**
   * Call once per AR frame with the raw detector outputs.
   * New track_ids are registered; existing ones are updated in place.
   * Stale tracks (unseen for > TRACK_TTL_MS) are evicted.
   */
  updateFrame(
    electrical: ARElectricalDetection[],
    exterior?: ARExteriorDetection[],
  ): void;

  /** Record a depth-anchored spatial distance (Depth Estimation output). */
  setDistance(key: string, value: string): void;

  /** Record a general measurement (e.g. from a ruler overlay). */
  setMeasurement(key: keyof ARMeasurements, value: string): void;

  /**
   * Commit the session: builds the payload from the current track
   * registries and POSTs it to the backend.
   * If a Main Service Panel is in the payload the backend will
   * auto-escalate the survey to "submitted".
   */
  commit(options?: { roof_type?: string }): Promise<ARDetectionResponse>;

  /** Fetch all previously committed detections for this survey. */
  fetchHistory(): Promise<ARDetectionListResponse>;

  /** Reset all track registries (start a new scan pass). */
  reset(): void;
}

export function createARDetectionSession(
  surveyId: string,
  projectId: string,
  authToken: string,
): ARDetectionSession {
  const electricalTracks = new Map<number, ElectricalTrack>();
  const exteriorTracks = new Map<number, ExteriorTrack>();
  const distances: ARDistances = {};
  const measurements: ARMeasurements = {};

  function evictStaleTracks(): void {
    const cutoff = Date.now() - TRACK_TTL_MS;
    for (const [id, track] of electricalTracks) {
      if (track.last_seen_at < cutoff) electricalTracks.delete(id);
    }
    for (const [id, track] of exteriorTracks) {
      if (track.last_seen_at < cutoff) exteriorTracks.delete(id);
    }
  }

  return {
    updateFrame(
      electrical: ARElectricalDetection[],
      exterior: ARExteriorDetection[] = [],
    ): void {
      const now = Date.now();

      for (const det of electrical) {
        electricalTracks.set(det.track_id, { ...det, last_seen_at: now });
      }

      for (const det of exterior) {
        exteriorTracks.set(det.track_id, { ...det, last_seen_at: now });
      }

      evictStaleTracks();
    },

    setDistance(key: string, value: string): void {
      distances[key] = value;
    },

    setMeasurement(key: keyof ARMeasurements, value: string): void {
      (measurements as Record<string, string>)[key as string] = value;
    },

    async commit(
      options: { roof_type?: string } = {},
    ): Promise<ARDetectionResponse> {
      evictStaleTracks();

      const electricalList = Array.from(electricalTracks.values()).map(
        // strip internal last_seen_at before sending
        ({ last_seen_at: _ts, ...det }) => det,
      );

      if (electricalList.length === 0) {
        throw new Error(
          "No electrical components detected — move the camera to the panel and try again.",
        );
      }

      const exteriorList = Array.from(exteriorTracks.values()).map(
        ({ last_seen_at: _ts, ...det }) => det,
      );

      const payload: ARDetectionPayload = {
        project_id: projectId,
        electrical: electricalList,
        exterior: exteriorList.length > 0 ? exteriorList : undefined,
        distances:
          Object.keys(distances).length > 0 ? { ...distances } : undefined,
        // explicit union of all active track IDs so the backend can index
        // them without re-parsing the electrical/exterior arrays
        track_ids: [
          ...electricalList.map((d) => d.track_id),
          ...exteriorList.map((d) => d.track_id),
        ].filter((v, i, a) => a.indexOf(v) === i),
        measurements: { ...measurements },
        roof_type: options.roof_type,
      };

      return submitARDetection(surveyId, payload, authToken);
    },

    async fetchHistory(): Promise<ARDetectionListResponse> {
      return fetchARDetections(surveyId, authToken);
    },

    reset(): void {
      electricalTracks.clear();
      exteriorTracks.clear();
      Object.keys(distances).forEach((k) => delete distances[k]);
      Object.keys(measurements).forEach(
        (k) => delete (measurements as Record<string, unknown>)[k],
      );
    },
  };
}
