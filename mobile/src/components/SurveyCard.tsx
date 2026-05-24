/**
 * components/SurveyCard.tsx
 *
 * A pressable card representing one survey in the list.
 * Shows project name, site, date, category, GPS indicator and sync badge.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import type { Survey } from '../types';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

interface Props {
  survey:  Omit<Survey, 'checklist' | 'photos'> & {
    checklist_count?: number;
    photo_count?:     number;
  };
  onPress: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleting?: boolean;
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

export default function SurveyCard({ survey, onPress, onDelete, deleteDisabled = false, deleting = false }: Props) {
  const date       = new Date(survey.survey_date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const hasGps     = survey.latitude != null && survey.longitude != null;
  const statusColor = STATUS_COLORS[survey.status]  ?? colors.textMuted;
  const syncColor   = SYNC_COLORS[survey.sync_status] ?? colors.textMuted;
  const syncLabel   = SYNC_LABELS[survey.sync_status] ?? survey.sync_status;
  const showStatusBadge = !(survey.sync_status === 'synced' && survey.status === 'draft');

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardPressArea} onPress={onPress} activeOpacity={0.8}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={styles.projectName} numberOfLines={1}>
            {survey.project_name}
          </Text>
          {showStatusBadge && (
            <View style={[styles.badge, { backgroundColor: statusColor }]}>
              <Text style={styles.badgeText}>{survey.status}</Text>
            </View>
          )}
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

      {!!onDelete && (
        <TouchableOpacity
          style={[styles.deleteButton, (deleteDisabled || deleting) && styles.deleteButtonDisabled]}
          onPress={onDelete}
          disabled={deleteDisabled || deleting}
        >
          {deleting
            ? <ActivityIndicator size="small" color="#ffffff" />
            : <Text style={styles.deleteButtonText}>🗑 Delete</Text>}
        </TouchableOpacity>
      )}
    </View>
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
  cardPressArea: {
    width: '100%',
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
  gpsTag: {
    fontSize: 12,
    color:    '#22c55e',
  },
  syncBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  syncText: {
    color:     '#ffffff',
    fontSize:  10,
    fontWeight:'700',
  },
  deleteButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
    backgroundColor: '#b91c1c',
    borderRadius: 10,
    minHeight: 34,
    minWidth: 108,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonDisabled: { opacity: 0.6 },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
