// ============================================================
// v2 survey upload. Every step is safe to repeat:
//   1. POST the survey (server upserts by id; it also drops server
//      photos this survey no longer has)
//   2. upload each photo not yet uploaded (server dedupes by client id)
//   3. POST /complete (server reuses or requeues its webhook event)
// Progress is stored per photo, so a killed app or dropped signal
// resumes where it stopped instead of starting over.
// ============================================================

import type { SessionExpiredError } from "../api/session";
import type { CapturedPhoto } from "./model";
import { buildSurveyPayload, goldenBlock, markupClientId, photoLabel, photosToSend } from "./payload";
import type { StoredSurvey } from "./repo";

/** Minutes to wait after the 1st, 2nd, … failure. */
export const BACKOFF_MINUTES = [1, 2, 5, 15, 30];

/** Marker for "waiting for sign-in": never retried by the timer. */
export const WAIT_FOR_LOGIN = "9999-12-31T00:00:00.000Z";

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
  /** Metadata-only update of an uploaded photo; null if the server lacks it. */
  updatePhotoMeta?: (surveyId: string, clientId: string, label: string, meta: Record<string, unknown>) => Promise<{ id: string } | null>;
  complete: (surveyId: string) => Promise<unknown>;
  /** Claim the survey for upload. False if it was reopened or is already being sent. */
  markSyncing: (id: string, generation: string | null) => Promise<boolean>;
  /** Still submitted (not reopened for editing since the claim)? */
  stillSubmitted: (id: string, generation: string | null) => Promise<boolean>;
  /** Mark uploaded only if the photo still matches what was sent (an edit made meanwhile stays pending). */
  markPhotoUploaded: (photoId: string, serverId: string | null, sent: CapturedPhoto) => Promise<void>;
  markSynced: (id: string, generation: string | null) => Promise<void>;
  markSyncError: (id: string, message: string, attempts: number, nextRetryAt: string | null, generation: string | null) => Promise<void>;
  isSessionExpired: (error: unknown) => error is SessionExpiredError;
  now: () => Date;
  onProgress?: (surveyId: string, done: number, total: number) => void;
}

export type SyncOutcome = "synced" | "error" | "needs_login" | "skipped";

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

class Reopened extends Error {}

export async function syncSurveyV2(survey: StoredSurvey, deps: SyncDeps): Promise<SyncOutcome> {
  // This pass uploads exactly this submit; a newer submit makes it stop.
  const gen = survey.submittedAt;
  if (!(await deps.markSyncing(survey.id, gen))) return "skipped";
  try {
    // Photos in items the surveyor later hid (e.g. answered "No sub panel")
    // or rejected stay on the phone and are not sent.
    const all = await deps.loadPhotos(survey.id);
    const photos = photosToSend(survey.doc, all);

    await deps.postSurvey(
      buildSurveyPayload({
        id: survey.id,
        doc: survey.doc,
        photos,
        deviceId: survey.deviceId,
        createdAt: survey.createdAt,
      }),
    );

    const pending = photos.filter((p) => p.uploadState !== "uploaded");
    const missing: string[] = [];
    let done = photos.length - pending.length;
    deps.onProgress?.(survey.id, done, photos.length);

    for (const photo of pending) {
      if (!(await deps.stillSubmitted(survey.id, gen))) throw new Reopened();
      const label = photoLabel(photo);
      if (!(await deps.fileExists(photo.relPath))) {
        missing.push(label);
        continue;
      }
      const meta = goldenBlock(photo, survey.doc);
      // Uploaded before and only its details changed (note, keep reason):
      // send the metadata, not the 1–2 MB image again.
      if (photo.serverPhotoId && deps.updatePhotoMeta) {
        const updated = await deps.updatePhotoMeta(survey.id, photo.id, label, meta);
        if (updated) {
          if (photo.annotatedRelPath) {
            const copyMeta = { ...meta, markupOf: photo.id };
            const copy = await deps.updatePhotoMeta(survey.id, markupClientId(photo), `${label} (marked up)`, copyMeta);
            // Server lost the marked-up copy: send it again in full.
            if (!copy && (await deps.fileExists(photo.annotatedRelPath))) {
              await deps.uploadPhoto(survey.id, {
                uri: deps.fileUri(photo.annotatedRelPath),
                mimeType: "image/jpeg",
                label: `${label} (marked up)`,
                clientId: markupClientId(photo),
                capturedAt: photo.capturedAt,
                meta: copyMeta,
              });
            }
          }
          await deps.markPhotoUploaded(photo.id, updated.id, photo);
          done++;
          deps.onProgress?.(survey.id, done, photos.length);
          continue;
        }
      }
      const original = await deps.uploadPhoto(survey.id, {
        uri: deps.fileUri(photo.relPath),
        mimeType: photo.mimeType,
        label,
        clientId: photo.id,
        capturedAt: photo.capturedAt,
        meta,
      });
      // The marked-up copy goes up as its own photo; the original is kept.
      if (photo.annotatedRelPath && (await deps.fileExists(photo.annotatedRelPath))) {
        await deps.uploadPhoto(survey.id, {
          uri: deps.fileUri(photo.annotatedRelPath),
          mimeType: "image/jpeg",
          label: `${label} (marked up)`,
          clientId: markupClientId(photo),
          capturedAt: photo.capturedAt,
          meta: { ...meta, markupOf: photo.id },
        });
      }
      await deps.markPhotoUploaded(photo.id, original.id, photo);
      done++;
      deps.onProgress?.(survey.id, done, photos.length);
    }

    if (missing.length) {
      throw new Error(`Photo file missing on this phone: ${missing.join(", ")}. Retake it, then submit again.`);
    }

    // Don't tell SolarPro it's complete if it was reopened mid-upload.
    if (!(await deps.stillSubmitted(survey.id, gen))) throw new Reopened();
    await deps.complete(survey.id);
    await deps.markSynced(survey.id, gen);
    return "synced";
  } catch (error) {
    if (error instanceof Reopened) return "skipped";
    if (deps.isSessionExpired(error)) {
      await deps.markSyncError(survey.id, "Sign in again to finish uploading.", survey.syncAttempts, WAIT_FOR_LOGIN, gen);
      return "needs_login";
    }
    const attempts = survey.syncAttempts + 1;
    await deps.markSyncError(survey.id, friendlySyncError(error), attempts, nextRetryAt(attempts, deps.now()), gen);
    return "error";
  }
}
