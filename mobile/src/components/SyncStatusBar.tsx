/**
 * components/SyncStatusBar.tsx
 *
 * Sticky banner shown at the top of the home screen.
 * Displays how many surveys are pending upload and the online/offline state.
 * Tapping the banner when online triggers an immediate sync.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

interface Props {
  isOnline:      boolean;
  pendingCount:  number;
  syncingCount:  number;
  errorCount:    number;
  onSyncPress:   () => void;
}

export default function SyncStatusBar({
  isOnline,
  pendingCount,
  syncingCount,
  errorCount,
  onSyncPress,
}: Props) {
  const isBusy   = syncingCount > 0;
  const hasError = errorCount   > 0;
  const total    = pendingCount + syncingCount + errorCount;

  // When everything is synced and we're online, show nothing (all good)
  if (isOnline && total === 0) return null;

  let bgColor   = colors.textMuted;
  let label     = 'Offline';
  if (isOnline && isBusy)         { bgColor = '#2563eb'; label = `Uploading ${syncingCount} survey${syncingCount !== 1 ? 's' : ''}…`; }
  else if (isOnline && hasError)  { bgColor = '#dc2626'; label = `${errorCount} upload failed — tap to retry`; }
  else if (isOnline && total > 0) { bgColor = '#f59e0b'; label = `${total} survey${total !== 1 ? 's' : ''} pending upload`; }
  else if (!isOnline && total > 0){ bgColor = colors.textMuted; label = `Offline — ${total} survey${total !== 1 ? 's' : ''} queued`; }

  return (
    <TouchableOpacity
      style={[styles.bar, { backgroundColor: bgColor }]}
      onPress={isOnline && !isBusy ? onSyncPress : undefined}
      activeOpacity={isOnline && !isBusy ? 0.7 : 1}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.inner}>
        {isBusy && (
          <ActivityIndicator size="small" color={colors.white} style={styles.spinner} />
        )}
        <Text style={styles.text}>{label}</Text>
        {isOnline && !isBusy && total > 0 && (
          <Text style={styles.cta}>Tap to sync</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical:    10,
    paddingHorizontal:  16,
    paddingTop:         Platform.OS === 'android' ? 10 : 10,
  },
  inner: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
  },
  spinner: {
    marginRight: 8,
  },
  text: {
    color:      colors.white,
    fontSize:   13,
    fontWeight: '600',
    textAlign:  'center',
  },
  cta: {
    color:        colors.background,
    fontSize:     12,
    marginLeft:   8,
    fontStyle:    'italic',
  },
});
