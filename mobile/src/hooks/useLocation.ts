/**
 * hooks/useLocation.ts
 *
 * Requests foreground location permission and captures a high-accuracy
 * GPS fix using expo-location's LocationAccuracy.BestForNavigation.
 * The hook exposes a `capture()` function so the user can re-trigger
 * location capture from the UI.
 */
import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import type { GpsCoordinates } from '../types';

type LocationStatus = 'idle' | 'requesting' | 'capturing' | 'success' | 'error';

interface UseLocationResult {
  coordinates: GpsCoordinates | null;
  status:      LocationStatus;
  errorMsg:    string | null;
  capture:     () => Promise<void>;
  clear:       () => void;
}

export function useLocation(): UseLocationResult {
  const [coordinates, setCoordinates] = useState<GpsCoordinates | null>(null);
  const [status,      setStatus]      = useState<LocationStatus>('idle');
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);

  const capture = useCallback(async () => {
    setStatus('requesting');
    setErrorMsg(null);

    // 1. Request foreground permission
    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      setErrorMsg('Location permission denied. Please enable it in Settings.');
      setStatus('error');
      return;
    }

    setStatus('capturing');

    try {
      // 2. Get a high-accuracy GPS fix
      //    BestForNavigation uses all available sensors (GPS + Wi-Fi + cell)
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.LocationAccuracy.BestForNavigation,
      });

      setCoordinates({
        latitude:  location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy:  location.coords.accuracy ?? undefined,
      });
      setStatus('success');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to retrieve location.';
      setErrorMsg(msg);
      setStatus('error');
    }
  }, []);

  const clear = useCallback(() => {
    setCoordinates(null);
    setStatus('idle');
    setErrorMsg(null);
  }, []);

  return { coordinates, status, errorMsg, capture, clear };
}
