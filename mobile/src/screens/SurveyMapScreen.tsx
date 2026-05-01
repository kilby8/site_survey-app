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

function hasValidCoords(item: Pick<SurveyListItem, 'latitude' | 'longitude'>): boolean {
  return Number.isFinite(item.latitude) && Number.isFinite(item.longitude);
}

function buildRegion(items: SurveyListItem[]): Region {
  const withCoords = items.filter(hasValidCoords);

  if (withCoords.length === 0) return DEFAULT_REGION;

  const lats = withCoords.map((s) => s.latitude as number);
  const lons = withCoords.map((s) => s.longitude as number);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLon + maxLon) / 2;
  const latitudeDelta = Math.max(0.02, (maxLat - minLat) * 1.6);
  const longitudeDelta = Math.max(0.02, (maxLon - minLon) * 1.6);

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

  const region = useMemo(() => buildRegion(mappable), [mappable]);

  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

  const openNativeMaps = useCallback((survey: SurveyListItem) => {
    if (!hasValidCoords(survey)) return;

    const lat = survey.latitude as number;
    const lon = survey.longitude as number;
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
        {mappable.map((survey) => (
          <Marker
            key={survey.id}
            coordinate={{ latitude: survey.latitude as number, longitude: survey.longitude as number }}
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
