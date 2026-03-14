/**
 * hooks/useSyncManager.ts
 *
 * React hook that exposes reactive sync status from SyncManager.ts.
 * Components subscribe to counts + online state via this hook.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  onSyncStatusChange,
  syncPending,
  isOnline as getIsOnline,
  type SyncStatusCallback,
} from '../services/SyncManager';
import { getSyncCounts } from '../database/surveyDb';

interface SyncState {
  pending:        number;
  syncing:        number;
  synced:         number;
  error:          number;
  isOnline:       boolean;
  /** Convenience: surveys not yet confirmed by the server */
  unsyncedCount:  number;
}

interface UseSyncManagerResult extends SyncState {
  /** Manually trigger a sync. */
  triggerSync: () => Promise<void>;
}

const INITIAL: SyncState = {
  pending: 0, syncing: 0, synced: 0, error: 0,
  isOnline: false, unsyncedCount: 0,
};

export function useSyncManager(dbReady: boolean): UseSyncManagerResult {
  const [state, setState] = useState<SyncState>(INITIAL);

  const refresh = useCallback(async () => {
    if (!dbReady) return;
    try {
      const counts = await getSyncCounts();
      setState({
        ...counts,
        isOnline:      getIsOnline(),
        unsyncedCount: counts.pending + counts.syncing + counts.error,
      });
    } catch { /* ignore during cold start */ }
  }, [dbReady]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to SyncManager events
  useEffect(() => {
    if (!dbReady) return;
    const handler: SyncStatusCallback = (counts) => {
      setState({
        ...counts,
        unsyncedCount: counts.pending + counts.syncing + counts.error,
      });
    };
    const unsub = onSyncStatusChange(handler);
    return unsub;
  }, [dbReady]);

  const triggerSync = useCallback(async () => {
    await syncPending();
    await refresh();
  }, [refresh]);

  return { ...state, triggerSync };
}
