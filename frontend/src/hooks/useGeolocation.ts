import { useState, useCallback } from 'react';
import type { GpsCoordinates } from '../types/survey';

interface GeolocationState {
  coordinates: GpsCoordinates | null;
  loading: boolean;
  error: string | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    coordinates: null,
    loading: false,
    error: null,
  });

  const capture = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation is not supported by this browser.' }));
      return;
    }

    setState(s => ({ ...s, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          coordinates: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
          loading: false,
          error: null,
        });
      },
      (err) => {
        let message = 'Unable to retrieve location.';
        if (err.code === err.PERMISSION_DENIED) message = 'Location permission denied.';
        else if (err.code === err.POSITION_UNAVAILABLE) message = 'Location information unavailable.';
        else if (err.code === err.TIMEOUT) message = 'Location request timed out.';
        setState(s => ({ ...s, loading: false, error: message }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  return { ...state, capture };
}
