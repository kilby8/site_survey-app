import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import MapView, { Callout, Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import type { Survey } from '../types';
import { getAllSurveys } from '../database/surveyDb';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

type SurveyListItem = Omit<Survey, 'checklist' | 'photos'>;

const DEFAULT_REGION: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 30,
  longitudeDelta: 30,
};

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LON = -180;
const MAX_LON = 180;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCoords(item: Pick<SurveyListItem, 'latitude' | 'longitude'>): { latitude: number; longitude: number } | null {
  const latitude = toFiniteNumber(item.latitude);
  const longitude = toFiniteNumber(item.longitude);
  if (latitude === null || longitude === null) return null;
  if (latitude < MIN_LAT || latitude > MAX_LAT) return null;
  if (longitude < MIN_LON || longitude > MAX_LON) return null;
  return { latitude, longitude };
}

function hasValidCoords(item: Pick<SurveyListItem, 'latitude' | 'longitude'>): boolean {
  return normalizeCoords(item) !== null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildRegion(items: SurveyListItem[]): Region {
  const withCoords = items
    .map((item) => normalizeCoords(item))
    .filter((item): item is { latitude: number; longitude: number } => item !== null);

  if (withCoords.length === 0) return DEFAULT_REGION;

  const lats = withCoords.map((s) => s.latitude);
  const lons = withCoords.map((s) => s.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latitude = clamp((minLat + maxLat) / 2, MIN_LAT, MAX_LAT);
  const longitude = clamp((minLon + maxLon) / 2, MIN_LON, MAX_LON);
  const latitudeDelta = clamp(Math.max(0.02, (maxLat - minLat) * 1.6), 0.02, 120);
  const longitudeDelta = clamp(Math.max(0.02, (maxLon - minLon) * 1.6), 0.02, 120);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

function markerColor(status: Survey['status']): string {
  if (status === 'synced') return '#16a34a';
  if (status === 'submitted') return '#2563eb';
  return '#f59e0b';
}

export default function SurveyMapScreen() {
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [canShowUserLocation, setCanShowUserLocation] = useState(false);

  const load = useCallback(async () => {
    const rows = await getAllSurveys();
    setSurveys(rows);
  }, []);

  const resolveLocationPermission = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        setCanShowUserLocation(true);
        return;
      }

      const requested = await Location.requestForegroundPermissionsAsync();
      setCanShowUserLocation(requested.status === 'granted');
    } catch {
      setCanShowUserLocation(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(console.error);
      resolveLocationPermission().catch(console.error);
    }, [load, resolveLocationPermission]),
  );

  const mappable = useMemo(
    () => surveys.filter(hasValidCoords),
    [surveys],
  );

  const mapMarkers = useMemo(
    () => mappable
      .map((survey) => {
        const coords = normalizeCoords(survey);
        return coords ? { survey, coords } : null;
      })
      .filter((item): item is { survey: SurveyListItem; coords: { latitude: number; longitude: number } } => item !== null),
    [mappable],
  );

  const region = useMemo(() => buildRegion(mappable), [mappable]);

  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

  const openNativeMaps = useCallback((survey: SurveyListItem) => {
    const coords = normalizeCoords(survey);
    if (!coords) return;

    const lat = coords.latitude;
    const lon = coords.longitude;
    const label = encodeURIComponent(survey.site_name || survey.project_name || 'Survey Site');

    const url = Platform.select({
      ios: `http://maps.apple.com/?ll=${lat},${lon}&q=${label}`,
      android: `geo:${lat},${lon}?q=${lat},${lon}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    });

    if (!url) return;

    Linking.openURL(url).catch((err) => {
      console.error('Open maps failed:', err);
    });
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Survey Map</Text>
        <Text style={styles.subtitle}>{mappable.length} mapped of {surveys.length} total</Text>
      </View>

      <MapView
        style={styles.map}
        provider={mapProvider}
        initialRegion={region}
        showsUserLocation={canShowUserLocation}
        showsCompass
      >
        {mapMarkers.map(({ survey, coords }) => (
          <Marker
            key={survey.id}
            coordinate={{ latitude: coords.latitude, longitude: coords.longitude }}
            pinColor={markerColor(survey.status)}
          >
            <Callout onPress={() => openNativeMaps(survey)}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{survey.site_name || 'Unnamed site'}</Text>
                <Text style={styles.calloutLine}>Project: {survey.project_name}</Text>
                <Text style={styles.calloutLine}>Inspector: {survey.inspector_name}</Text>
                <Text style={styles.calloutLink}>Open in Maps</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <View style={styles.legend}>
        <Text style={styles.legendText}>● Draft</Text>
        <Text style={[styles.legendText, { color: '#2563eb' }]}>● Submitted</Text>
        <Text style={[styles.legendText, { color: '#16a34a' }]}>● Synced</Text>
      </View>

      <TouchableOpacity style={styles.refreshBtn} onPress={() => load().catch(console.error)}>
        <Text style={styles.refreshBtnText}>Refresh Pins</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  map: { flex: 1 },
  callout: { minWidth: 180, maxWidth: 220 },
  calloutTitle: { fontWeight: '700', marginBottom: 4, color: '#0B1220' },
  calloutLine: { fontSize: 12, color: '#1f2937' },
  calloutLink: { marginTop: 6, color: '#2563eb', fontWeight: '700', fontSize: 12 },
  legend: {
    position: 'absolute',
    left: 12,
    bottom: 22,
    backgroundColor: 'rgba(10,21,51,0.92)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  legendText: { color: '#f59e0b', fontSize: 12, fontWeight: '700' },
  refreshBtn: {
    position: 'absolute',
    right: 12,
    bottom: 22,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refreshBtnText: { color: '#0B1220', fontWeight: '800', fontSize: 12 },
});
