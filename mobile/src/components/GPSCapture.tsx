/**
 * components/GPSCapture.tsx
 *
 * UI block for capturing and displaying GPS coordinates.
 * Shows accuracy in metres once a fix is obtained.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import type { GpsCoordinates } from '../types';

type Status = 'idle' | 'requesting' | 'capturing' | 'success' | 'error';

interface Props {
  coordinates: GpsCoordinates | null;
  status:      Status;
  errorMsg:    string | null;
  onCapture:   () => void;
  onClear?:    () => void;
}

export default function GPSCapture({
  coordinates, status, errorMsg, onCapture, onClear,
}: Props) {
  const isBusy = status === 'requesting' || status === 'capturing';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>GPS Coordinates</Text>

      {coordinates ? (
        <View style={styles.coordBox}>
          <Text style={styles.coordText}>
            {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
          </Text>
          {coordinates.accuracy !== undefined && (
            <Text style={styles.accuracy}>
              ± {coordinates.accuracy.toFixed(1)} m accuracy
            </Text>
          )}
          <View style={styles.row}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onCapture}>
              <Text style={styles.btnSecondaryText}>🔄 Refresh</Text>
            </TouchableOpacity>
            {onClear && (
              <TouchableOpacity style={styles.btnClear} onPress={onClear}>
                <Text style={styles.btnClearText}>✕ Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.captureBtn, isBusy && styles.captureBtnDisabled]}
          onPress={onCapture}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.captureBtnText}>📍 Capture Location</Text>
          )}
        </TouchableOpacity>
      )}

      {status === 'capturing' && (
        <Text style={styles.hint}>Acquiring high-accuracy GPS fix…</Text>
      )}
      {status === 'requesting' && (
        <Text style={styles.hint}>Requesting location permission…</Text>
      )}
      {errorMsg && (
        <Text style={styles.error}>{errorMsg}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { marginBottom: 16 },
  label:             { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  coordBox: {
    backgroundColor: '#f0fdf4',
    borderColor:     '#bbf7d0',
    borderWidth:     1,
    borderRadius:    8,
    padding:         12,
  },
  coordText:         { fontSize: 15, fontWeight: '700', color: '#15803d', fontFamily: 'monospace' },
  accuracy:          { fontSize: 12, color: '#16a34a', marginTop: 2 },
  row:               { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnSecondary: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor:   '#dcfce7', borderRadius: 6,
  },
  btnSecondaryText:  { color: '#15803d', fontSize: 13, fontWeight: '600' },
  btnClear: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor:   '#fee2e2', borderRadius: 6,
  },
  btnClearText:      { color: '#dc2626', fontSize: 13, fontWeight: '600' },
  captureBtn: {
    backgroundColor: '#1a56db',
    paddingVertical: 14,
    borderRadius:    10,
    alignItems:      'center',
    minHeight:       48,
    justifyContent:  'center',
  },
  captureBtnDisabled:{ backgroundColor: '#93c5fd' },
  captureBtnText:    { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  hint:              { marginTop: 6, fontSize: 12, color: '#6b7280', textAlign: 'center' },
  error:             { marginTop: 6, fontSize: 12, color: '#dc2626' },
});
