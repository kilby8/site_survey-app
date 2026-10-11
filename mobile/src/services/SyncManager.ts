/**
 * services/SyncManager.ts
 *
 * Background sync service — offline-first engine.
 *
 * Responsibilities:
 *  1. Watch network state via expo-network addNetworkStateListener.
 *  2. On reconnect (or explicit trigger), fetch all 'pending'/'error'
 *     surveys from the local SQLite DB.
 *  3. POST each survey to the backend /api/surveys endpoint.
 *  4. Upload any attached photos as multipart/form-data to
 *     /api/surveys/:id/photos.
 *  5. Mark each record as 'synced' in the local DB on success,
 *     or store the error message on failure.
 */
import * as Network from 'expo-network';
import type { EventSubscription } from 'expo-modules-core';
import {
  getPendingSurveys,
  setSyncStatus,
  ensureSurveyUuid,
  getSurveyById,
  recoverStuckSyncingSurveys,
} from '../database/surveyDb';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import {
  postSurvey,
  uploadPhotos,
  completeSurvey,
  warmUpApi,
  postSurveyV2,
  uploadSurveyPhotoV2,
  completeSurveyV2,
} from '../api/client';
import { SessionExpiredError } from '../api/session';
import type { Survey } from '../types';
import * as repo from '../survey/repo';
import { syncSurveyV2, type SyncDeps } from '../survey/sync';

// ----------------------------------------------------------------
// Sync state callback type
// ----------------------------------------------------------------
export type SyncStatusCallback = (counts: {
  pending:  number;
  syncing:  number;
  synced:   number;
  error:    number;
  isOnline: boolean;
}) => void;

// ----------------------------------------------------------------
// Internal state
// ----------------------------------------------------------------
let _isSyncing        = false;
let _isOnline         = false;
let _subscription:     EventSubscription | null = null;
let _appStateSub:      NativeEventSubscription | null = null;
let _retryTimer:       ReturnType<typeof setTimeout> | null = null;
let _rerun            = false;
let _progressListeners: ((surveyId: string, done: number, total: number) => void)[] = [];
let _statusCallbacks: SyncStatusCallback[] = [];
let _deviceId         = '';
let _telemetryListener: ((event: {
  type: 'sync_start' | 'sync_success' | 'sync_error';
  surveyId: string;
  durationMs: number;
  error?: string;
}) => void) | null = null;

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/** Call once at app startup, passing the device's unique identifier. */
export async function initSyncManager(deviceId: string): Promise<void> {
  if (!deviceId) {
    console.warn('[SyncManager] initSyncManager called without a deviceId — sync disabled');
    return;
  }
  _deviceId = deviceId;

  // Recover stale `syncing` rows left behind by interrupted app sessions.
  try {
    await repo.recoverInterruptedSyncs();
  } catch (err) {
    console.warn('[SyncManager] Failed to recover v2 syncs:', err);
  }
  try {
    const recovered = await recoverStuckSyncingSurveys(0);
    if (recovered > 0) {
      console.warn(`[SyncManager] Recovered ${recovered} stuck syncing survey(s)`);
      await _notifyCallbacks();
    }
  } catch (err) {
    console.warn('[SyncManager] Failed to recover stuck syncing surveys:', err);
  }

  // Check initial network state
  const state = await Network.getNetworkStateAsync();
  _isOnline = !!(state.isConnected && state.isInternetReachable);

  // Subscribe to network changes
  if (_subscription) _subscription.remove();
  _subscription = Network.addNetworkStateListener((event) => {
    const wasOffline = !_isOnline;
    _isOnline = !!(event.isConnected && event.isInternetReachable);

    // Auto-trigger sync when connectivity is restored
    if (wasOffline && _isOnline) {
      syncPending({ force: true }).catch(console.error);
    }
    _notifyCallbacks();
  });

  // Coming back to the app is a good moment to retry.
  if (_appStateSub) _appStateSub.remove();
  _appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') syncPending({ force: true }).catch(console.error);
  });

  // Attempt an initial sync if already online
  if (_isOnline) {
    syncPending({ force: true }).catch(console.error);
  }
}

/** Live per-photo progress for v2 uploads. */
export function onSurveyUploadProgress(
  listener: (surveyId: string, done: number, total: number) => void,
): () => void {
  _progressListeners.push(listener);
  return () => {
    _progressListeners = _progressListeners.filter((l) => l !== listener);
  };
}

/** Tear down the network listener (call on app unmount / logout). */
export function teardownSyncManager(): void {
  if (_subscription) {
    _subscription.remove();
    _subscription = null;
  }
  if (_appStateSub) {
    _appStateSub.remove();
    _appStateSub = null;
  }
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = null;
  _statusCallbacks = [];
}

/** Subscribe to sync count / online status changes. Returns an unsubscribe fn. */
export function onSyncStatusChange(cb: SyncStatusCallback): () => void {
  _statusCallbacks.push(cb);
  return () => {
    _statusCallbacks = _statusCallbacks.filter(c => c !== cb);
  };
}

/** Whether the device currently has internet connectivity. */
export function isOnline(): boolean {
  return _isOnline;
}

/**
 * Upload everything that is waiting. Safe to call any time: a call made
 * while a run is in progress schedules one more run afterwards.
 *
 * `force` also retries surveys whose backoff hasn't expired (used when the
 * network comes back, the app is reopened, or the user taps Retry).
 */
export async function syncPending(options?: { includeErrors?: boolean; force?: boolean }): Promise<void> {
  if (_isSyncing) {
    _rerun = true;
    return;
  }
  if (!_isOnline) return;
  _isSyncing = true;
  const force = options?.force ?? options?.includeErrors ?? true;

  try {
    const legacy = await getPendingSurveys({ includeErrors: true });
    const due = await repo.surveysDueForSync(new Date().toISOString(), force);
    if (legacy.length === 0 && due.length === 0) return;

    // Absorb a Render cold start with one cheap request first.
    await warmUpApi();

    for (const survey of legacy) {
      try {
        await _syncOneSurvey(survey);
      } catch (err) {
        console.warn('[SyncManager] legacy survey failed', survey.id, err);
      }
      _notifyCallbacks();
    }

    for (const survey of due) {
      const outcome = await syncSurveyV2(survey, _v2Deps);
      _notifyCallbacks();
      if (outcome === 'needs_login') break; // nothing else will upload until sign-in
    }
  } finally {
    _isSyncing = false;
    _notifyCallbacks();
    await _scheduleNextRetry();
    if (_rerun) {
      _rerun = false;
      syncPending({ force: false }).catch(console.error);
    }
  }
}

/** Arm a timer for the earliest v2 retry so failed uploads retry on their own. */
async function _scheduleNextRetry(): Promise<void> {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = null;
  try {
    const waiting = await repo.surveysDueForSync(new Date(8.64e15).toISOString(), true);
    const times = waiting
      .map((s) => (s.nextRetryAt ? Date.parse(s.nextRetryAt) : Date.now()))
      .filter((t) => Number.isFinite(t));
    if (!times.length) return;
    const delay = Math.max(5_000, Math.min(...times) - Date.now());
    _retryTimer = setTimeout(() => {
      syncPending({ force: false }).catch(console.error);
    }, Math.min(delay, 30 * 60_000));
  } catch {
    // DB not ready
  }
}

const _v2Deps: SyncDeps = {
  loadPhotos: repo.loadPhotos,
  fileExists: async (rel) => {
    try {
      return (await FileSystem.getInfoAsync(repo.absPath(rel))).exists;
    } catch {
      return false;
    }
  },
  fileUri: repo.absPath,
  postSurvey: postSurveyV2,
  uploadPhoto: uploadSurveyPhotoV2,
  complete: completeSurveyV2,
  markSyncing: async (id) => {
    await repo.markSyncing(id);
    _notifyCallbacks();
  },
  markPhotoUploaded: repo.markPhotoUploaded,
  markSynced: repo.markSynced,
  markSyncError: repo.markSyncError,
  isSessionExpired: (e): e is SessionExpiredError => e instanceof SessionExpiredError,
  now: () => new Date(),
  onProgress: (id, done, total) => _progressListeners.forEach((l) => l(id, done, total)),
};

/** Optional telemetry listener for sync events. */
export function onSyncTelemetry(
  listener: ((event: {
    type: 'sync_start' | 'sync_success' | 'sync_error';
    surveyId: string;
    durationMs: number;
    error?: string;
  }) => void) | null,
): void {
  _telemetryListener = listener;
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

async function _syncOneSurvey(survey: Survey): Promise<void> {
  const startedAt = Date.now();
  let workingSurvey = survey;

  const migratedId = await ensureSurveyUuid(survey.id);
  if (migratedId !== survey.id) {
    const migrated = await getSurveyById(migratedId);
    if (!migrated) {
      throw new Error('Failed to migrate local survey ID for sync');
    }
    workingSurvey = migrated;
  }

  _telemetryListener?.({
    type: 'sync_start',
    surveyId: workingSurvey.id,
    durationMs: 0,
  });

  // Mark as syncing so the UI shows a spinner for this record
  await setSyncStatus(workingSurvey.id, 'syncing');
  _notifyCallbacks();

  try {
    // 1. POST survey JSON to the backend
    //    The local UUID is sent as `id` so the server stores the same ID,
    //    enabling idempotent re-sync if the app crashes mid-upload.
    try {
      await postSurvey({
        id:                  workingSurvey.id,
        project_name:        workingSurvey.project_name,
        project_id:          workingSurvey.project_id,
        category_id:         workingSurvey.category_id,
        category_name:       workingSurvey.category_name,
        inspector_name:      workingSurvey.inspector_name,
        site_name:           workingSurvey.site_name,
        site_address:        workingSurvey.site_address,
        latitude:            workingSurvey.latitude,
        longitude:           workingSurvey.longitude,
        gps_accuracy:        workingSurvey.gps_accuracy,
        survey_date:         workingSurvey.survey_date,
        notes:               workingSurvey.notes,
        status:              'submitted',
        device_id:           _deviceId,
        // SolarPro ownership — persisted in SQLite at survey creation time so
        // the webhook can resolve the correct project owner on the server side.
        solarpro_user_id:    workingSurvey.solarpro_user_id    ?? null,
        solarpro_project_id: workingSurvey.solarpro_project_id ?? null,
        solarpro_email:      workingSurvey.solarpro_email      ?? null,
        solarpro_org_id:     workingSurvey.solarpro_org_id     ?? null,
        metadata:            workingSurvey.metadata ?? null,
        checklist: (workingSurvey.checklist ?? []).map(c => ({
          label:      c.label,
          status:     c.status,
          notes:      c.notes,
          sort_order: c.sort_order,
        })),
        photos: [],   // photos uploaded separately below
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Survey post failed: ${message}`);
    }

    // 2. Upload photos as multipart/form-data (one batch per survey)
    if (workingSurvey.photos && workingSurvey.photos.length > 0) {
      try {
        await uploadPhotos(
          workingSurvey.id,
          workingSurvey.photos.map(p => ({
            uri:      p.file_path,       // local file:// URI
            label:    p.label,
            mimeType: p.mime_type,
          }))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Photo upload failed (${workingSurvey.photos.length}): ${message}`);
      }
    }

    // 3. Mark survey complete to enqueue webhook delivery for external pipeline
    try {
      await completeSurvey(workingSurvey.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Survey completion webhook enqueue failed: ${message}`);
    }

    // 4. Mark the local record as synced
    await setSyncStatus(workingSurvey.id, 'synced');

    _telemetryListener?.({
      type: 'sync_success',
      surveyId: workingSurvey.id,
      durationMs: Date.now() - startedAt,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setSyncStatus(workingSurvey.id, 'error', message);
    console.warn(`[SyncManager] Failed to sync survey ${workingSurvey.id}:`, message);
    _telemetryListener?.({
      type: 'sync_error',
      surveyId: workingSurvey.id,
      durationMs: Date.now() - startedAt,
      error: message,
    });
  }
}

async function _notifyCallbacks(): Promise<void> {
  if (_statusCallbacks.length === 0) return;
  try {
    const { getSyncCounts } = await import('../database/surveyDb');
    const counts = await getSyncCounts();
    const payload = { ...counts, isOnline: _isOnline };
    _statusCallbacks.forEach(cb => cb(payload));
  } catch { /* DB may not be ready yet */ }
}
