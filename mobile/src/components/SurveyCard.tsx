/**
 * components/SurveyCard.tsx
 *
 * A pressable card representing one survey in the list.
 * Shows project name, site, date, category, GPS indicator and sync badge.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Survey } from '../types';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

interface Props {
  survey:  Omit<Survey, 'checklist' | 'photos'> & {
    checklist_count?: number;
    photo_count?:     number;
  };
  onPress: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft:     colors.textMuted,
  submitted: '#2563eb',
  synced:    '#16a34a',
};

const SYNC_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  syncing: '#2563eb',
  synced:  '#16a34a',
  error:   '#dc2626',
};

const SYNC_LABELS: Record<string, string> = {
  pending: '⏳ Pending',
  syncing: '⬆ Uploading',
  synced:  '✓ Synced',
  error:   '✗ Error',
};

export default function SurveyCard({ survey, onPress }: Props) {
  const date       = new Date(survey.survey_date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const hasGps     = survey.latitude != null && survey.longitude != null;
  const statusColor = STATUS_COLORS[survey.status]  ?? colors.textMuted;
  const syncColor   = SYNC_COLORS[survey.sync_status] ?? colors.textMuted;
  const syncLabel   = SYNC_LABELS[survey.sync_status] ?? survey.sync_status;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.projectName} numberOfLines={1}>
          {survey.project_name}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusColor }]}>
          <Text style={styles.badgeText}>{survey.status}</Text>
        </View>
      </View>

      {/* Site name */}
      <Text style={styles.siteName} numberOfLines={1}>
        📍 {survey.site_name}
      </Text>

      {/* Address */}
      {!!survey.site_address && (
        <Text style={styles.address} numberOfLines={1}>
          {survey.site_address}
        </Text>
      )}

      {/* Meta row */}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>👤 {survey.inspector_name}</Text>
        <Text style={styles.meta}>📅 {date}</Text>
      </View>

      {/* Footer row */}
      <View style={styles.footerRow}>
        {survey.category_name && (
          <View style={styles.category}>
            <Text style={styles.categoryText}>{survey.category_name}</Text>
          </View>
        )}
        {hasGps && (
          <Text style={styles.gpsTag}>🛰 GPS</Text>
        )}
        {typeof survey.checklist_count === 'number' && (
          <Text style={styles.meta}>✅ {survey.checklist_count} items</Text>
        )}
        {typeof survey.photo_count === 'number' && survey.photo_count > 0 && (
          <Text style={styles.meta}>📷 {survey.photo_count}</Text>
        )}
      </View>

      {/* Sync status badge */}
      <View style={[styles.syncBadge, { backgroundColor: syncColor }]}>
        <Text style={styles.syncText}>{syncLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius:    16,
    padding:         16,
    marginBottom:    14,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.28,
    shadowRadius:    10,
    elevation:       6,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    position:        'relative',
  },
  headerRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    4,
  },
  projectName: {
    fontSize:    19,
    fontWeight:  '800',
    letterSpacing: -0.3,
    color:       colors.textPrimary,
    flex:        1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      12,
  },
  badgeText: {
    color:     '#ffffff',
    fontSize:  11,
    fontWeight:'700',
    textTransform: 'uppercase',
  },
  siteName: {
    fontSize:    14,
    color:       colors.primary,
    fontWeight:  '600',
    marginBottom: 4,
  },
  address: {
    fontSize:    13,
    color:       colors.textMuted,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    gap:           12,
    marginBottom:  8,
  },
  meta: {
    fontSize: 12,
    color:    colors.textMuted,
  },
  footerRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
    alignItems:    'center',
  },
  category: {
    backgroundColor: 'rgba(255,176,32,0.12)',
    borderColor: 'rgba(255,176,32,0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical:   3,
    borderRadius:      20,
  },
  categoryText: {
    fontSize:  12,
    color:     colors.primary,
    fontWeight:'600',
  },
  gpsTag: {
    fontSize: 12,
    color:    '#22c55e',
  },
  syncBadge: {
    position:          'absolute',
    top:               12,
    right:             60,
    paddingHorizontal:  7,
    paddingVertical:    2,
    borderRadius:       8,
  },
  syncText: {
    color:     '#ffffff',
    fontSize:  10,
    fontWeight:'700',
  },
});
