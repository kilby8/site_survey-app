// Crew side of an install job for the open screen: the other crew members'
// photos, and how up to date this phone is. Syncs on open, every 20 s while
// the screen is in front, and shortly after this phone adds or removes a photo.

import { useFocusEffect } from "expo-router";
import React from "react";
import { installJobSyncState, onInstallJobSync, syncInstallJobs, type InstallJobSyncState } from "../services/SyncManager";
import { getCrewPhotos, onCrewPhotos } from "./installJob";
import type { CapturedPhoto } from "./model";

const POLL_MS = 20_000;

export function useCrew(jobId: string | null, localPhotoCount: number): { photos: CapturedPhoto[]; state: InstallJobSyncState } {
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>(() => (jobId ? getCrewPhotos(jobId) : []));
  const [state, setState] = React.useState<InstallJobSyncState>(() =>
    jobId ? installJobSyncState(jobId) : { lastSyncedAt: null, waiting: 0, error: null },
  );

  React.useEffect(() => {
    if (!jobId) return;
    setPhotos(getCrewPhotos(jobId));
    const a = onCrewPhotos((id) => id === jobId && setPhotos(getCrewPhotos(jobId)));
    const b = onInstallJobSync((id, st) => id === jobId && setState(st));
    return () => {
      a();
      b();
    };
  }, [jobId]);

  useFocusEffect(
    React.useCallback(() => {
      if (!jobId) return;
      void syncInstallJobs(jobId);
      const t = setInterval(() => void syncInstallJobs(jobId), POLL_MS);
      return () => clearInterval(t);
    }, [jobId]),
  );

  // A new or removed local photo goes up soon after.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (!jobId) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void syncInstallJobs(jobId), 1500);
    return () => clearTimeout(t);
  }, [jobId, localPhotoCount]);

  return { photos, state };
}
