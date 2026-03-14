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
} from '../database/surveyDb';
import { postSurvey, uploadPhotos } from '../api/client';
import type { Survey } from '../types';

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
let _statusCallbacks: SyncStatusCallback[] = [];
let _deviceId         = 'unknown';

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/** Call once at app startup, passing the device's unique identifier. */
export async function initSyncManager(deviceId: string): Promise<void> {
  _deviceId = deviceId;

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
      syncPending().catch(console.error);
    }
    _notifyCallbacks();
  });

  // Attempt an initial sync if already online
  if (_isOnline) {
    syncPending().catch(console.error);
  }
}

/** Tear down the network listener (call on app unmount / logout). */
export function teardownSyncManager(): void {
  if (_subscription) {
    _subscription.remove();
    _subscription = null;
  }
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
 * Manually trigger a sync. Safe to call multiple times — concurrent
 * runs are de-duplicated by the _isSyncing guard.
 */
export async function syncPending(): Promise<void> {
  if (_isSyncing || !_isOnline) return;
  _isSyncing = true;

  try {
    const surveys = await getPendingSurveys();
    if (surveys.length === 0) return;

    for (const survey of surveys) {
      await _syncOneSurvey(survey);
    }
  } finally {
    _isSyncing = false;
    _notifyCallbacks();
  }
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

async function _syncOneSurvey(survey: Survey): Promise<void> {
  // Mark as syncing so the UI shows a spinner for this record
  await setSyncStatus(survey.id, 'syncing');
  _notifyCallbacks();

  try {
    // 1. POST survey JSON to the backend
    //    The local UUID is sent as `id` so the server stores the same ID,
    //    enabling idempotent re-sync if the app crashes mid-upload.
    await postSurvey({
      id:             survey.id,
      project_name:   survey.project_name,
      category_id:    survey.category_id,
      category_name:  survey.category_name,
      inspector_name: survey.inspector_name,
      site_name:      survey.site_name,
      site_address:   survey.site_address,
      latitude:       survey.latitude,
      longitude:      survey.longitude,
      gps_accuracy:   survey.gps_accuracy,
      survey_date:    survey.survey_date,
      notes:          survey.notes,
      status:         'submitted',
      device_id:      _deviceId,
      checklist: (survey.checklist ?? []).map(c => ({
        label:      c.label,
        status:     c.status,
        notes:      c.notes,
        sort_order: c.sort_order,
      })),
      photos: [],   // photos uploaded separately below
    });

    // 2. Upload photos as multipart/form-data (one batch per survey)
    if (survey.photos && survey.photos.length > 0) {
      await uploadPhotos(
        survey.id,
        survey.photos.map(p => ({
          uri:      p.file_path,       // local file:// URI
          label:    p.label,
          mimeType: p.mime_type,
        }))
      );
    }

    // 3. Mark the local record as synced
    await setSyncStatus(survey.id, 'synced');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setSyncStatus(survey.id, 'error', message);
    console.warn(`[SyncManager] Failed to sync survey ${survey.id}:`, message);
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
