// ============================================================
// v2 survey upload. Every step is safe to repeat:
//   1. POST the survey (server upserts by id)
//   2. upload each photo not yet uploaded (server dedupes by client id)
//   3. POST /complete (server reuses or requeues its webhook event)
// Progress is stored per photo, so a killed app or dropped signal
// resumes where it stopped instead of starting over.
// ============================================================

import type { SessionExpiredError } from "../api/session";
import type { CapturedPhoto } from "./model";
import { buildSurveyPayload, goldenBlock, photoLabel } from "./payload";
import type { StoredSurvey } from "./repo";

/** Minutes to wait after the 1st, 2nd, … failure. */
export const BACKOFF_MINUTES = [1, 2, 5, 15, 30];

export function nextRetryAt(attempts: number, now: Date): string {
  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 30;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export interface SyncDeps {
  loadPhotos: (surveyId: string) => Promise<CapturedPhoto[]>;
  fileExists: (relPath: string) => Promise<boolean>;
  fileUri: (relPath: string) => string;
  postSurvey: (payload: object) => Promise<unknown>;
  uploadPhoto: (
    surveyId: string,
    photo: { uri: string; mimeType: string; label: string; clientId: string; capturedAt: string; meta: Record<string, unknown> },
  ) => Promise<{ id: string | null }>;
  complete: (surveyId: string) => Promise<unknown>;
  markSyncing: (id: string) => Promise<void>;
  markPhotoUploaded: (photoId: string, serverId: string | null) => Promise<void>;
  markSynced: (id: string) => Promise<void>;
  markSyncError: (id: string, message: string, attempts: number, nextRetryAt: string | null) => Promise<void>;
  isSessionExpired: (error: unknown) => error is SessionExpiredError;
  now: () => Date;
  onProgress?: (surveyId: string, done: number, total: number) => void;
}

export type SyncOutcome = "synced" | "error" | "needs_login";

/** Plain-language message for the survey card. */
export function friendlySyncError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const m = raw.toLowerCase();
  if (m.includes("cannot reach api") || m.includes("network request failed") || m.includes("aborted")) {
    return "No connection to the server. Will retry automatically.";
  }
  if (m.includes("413") || m.includes("exceeds")) return "A photo is too large to upload.";
  if (m.includes("http 5") || m.includes("internal")) return "Server error. Will retry automatically.";
  return raw;
}

export async function syncSurveyV2(
  survey: StoredSurvey,
  deps: SyncDeps,
): Promise<SyncOutcome> {
  await deps.markSyncing(survey.id);
  try {
    const photos = await deps.loadPhotos(survey.id);

    await deps.postSurvey(
      buildSurveyPayload({
        id: survey.id,
        doc: survey.doc,
        photos,
        deviceId: survey.deviceId,
        createdAt: survey.createdAt,
      }),
    );

    // Upload the original, plus the marked-up copy as its own photo.
    const pending = photos.filter((p) => p.uploadState !== "uploaded");
    const missing: string[] = [];
    let done = photos.length - pending.length;
    deps.onProgress?.(survey.id, done, photos.length);

    for (const photo of pending) {
      const label = photoLabel(photo);
      if (!(await deps.fileExists(photo.relPath))) {
        missing.push(label);
        continue;
      }
      const meta = goldenBlock(photo, survey.doc);
      const original = await deps.uploadPhoto(survey.id, {
        uri: deps.fileUri(photo.relPath),
        mimeType: photo.mimeType,
        label,
        clientId: photo.id,
        capturedAt: photo.capturedAt,
        meta,
      });
      if (photo.annotatedRelPath && (await deps.fileExists(photo.annotatedRelPath))) {
        await deps.uploadPhoto(survey.id, {
          uri: deps.fileUri(photo.annotatedRelPath),
          mimeType: "image/jpeg",
          label: `${label} (marked up)`,
          clientId: `${photo.id}-markup-${photo.annotatedRelPath.split("/").pop()}`,
          capturedAt: photo.capturedAt,
          meta: { ...meta, markupOf: photo.id },
        });
      }
      await deps.markPhotoUploaded(photo.id, original.id);
      done++;
      deps.onProgress?.(survey.id, done, photos.length);
    }

    if (missing.length) {
      throw new Error(`Photo file missing on this phone: ${missing.join(", ")}. Retake it, then submit again.`);
    }

    await deps.complete(survey.id);
    await deps.markSynced(survey.id);
    return "synced";
  } catch (error) {
    if (deps.isSessionExpired(error)) {
      await deps.markSyncError(survey.id, "Sign in again to finish uploading.", survey.syncAttempts, null);
      return "needs_login";
    }
    const attempts = survey.syncAttempts + 1;
    await deps.markSyncError(survey.id, friendlySyncError(error), attempts, nextRetryAt(attempts, deps.now()));
    return "error";
  }
}
