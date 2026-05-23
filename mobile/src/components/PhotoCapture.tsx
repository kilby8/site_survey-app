import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  Image, Alert, StyleSheet, ActivityIndicator,
} from 'react-native';
import {
  captureFromCamera,
  captureMultipleFromCamera,
  pickFromLibrary,
  pickMultipleFromLibrary,
} from '../services/photoService';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;
const MAX_TOTAL_PHOTOS = 60;

/**
 * components/PhotoCapture.tsx
 *
 * UI for capturing and labelling site photos.
 * Photos are immediately copied to the app's document directory.
 * Calls back with the permanent local file path for SQLite storage.
 */
export interface PhotoDraft {
  uri:      string;
  label:    string;
  mimeType: string;
}

interface Props {
  photos:   PhotoDraft[];
  onChange: (photos: PhotoDraft[]) => void;
}

export default function PhotoCapture({ photos, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const atMaxPhotos = photos.length >= MAX_TOTAL_PHOTOS;
  const photosRemaining = Math.max(0, MAX_TOTAL_PHOTOS - photos.length);

  function appendPhotos(nextPhotos: Array<{ uri: string; label: string; mimeType: string }>) {
    if (nextPhotos.length === 0) return;

    const roomLeft = Math.max(0, MAX_TOTAL_PHOTOS - photos.length);
    if (roomLeft <= 0) {
      Alert.alert('Photo Limit Reached', `You can add up to ${MAX_TOTAL_PHOTOS} photos per survey.`);
      return;
    }

    const accepted = nextPhotos.slice(0, roomLeft);
    const dropped = nextPhotos.length - accepted.length;
    onChange([...photos, ...accepted]);

    if (dropped > 0) {
      Alert.alert(
        'Photo Limit Reached',
        `Added ${accepted.length} photo(s). ${dropped} photo(s) were skipped to keep the ${MAX_TOTAL_PHOTOS}-photo limit.`,
      );
    }
  }

  async function handleCamera() {
    if (atMaxPhotos) {
      Alert.alert('Photo Limit Reached', `You can add up to ${MAX_TOTAL_PHOTOS} photos per survey.`);
      return;
    }
    setLoading(true);
    try {
      const photo = await captureFromCamera();
      if (photo) {
        appendPhotos([{ uri: photo.uri, label: '', mimeType: photo.mimeType }]);
      }
    } catch (err) {
      Alert.alert('Camera Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCameraMulti() {
    if (atMaxPhotos) {
      Alert.alert('Photo Limit Reached', `You can add up to ${MAX_TOTAL_PHOTOS} photos per survey.`);
      return;
    }
    setLoading(true);
    try {
      const multi = await captureMultipleFromCamera(12);
      if (multi.length > 0) {
        appendPhotos(
          multi.map((photo) => ({ uri: photo.uri, label: '', mimeType: photo.mimeType })),
        );
      }
    } catch (err) {
      Alert.alert('Camera Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLibrary() {
    if (atMaxPhotos) {
      Alert.alert('Photo Limit Reached', `You can add up to ${MAX_TOTAL_PHOTOS} photos per survey.`);
      return;
    }
    setLoading(true);
    try {
      const photo = await pickFromLibrary();
      if (photo) {
        appendPhotos([{ uri: photo.uri, label: '', mimeType: photo.mimeType }]);
      }
    } catch (err) {
      Alert.alert('Library Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLibraryMulti() {
    if (atMaxPhotos) {
      Alert.alert('Photo Limit Reached', `You can add up to ${MAX_TOTAL_PHOTOS} photos per survey.`);
      return;
    }
    setLoading(true);
    try {
      const multi = await pickMultipleFromLibrary(20);
      if (multi.length > 0) {
        appendPhotos(
          multi.map((photo) => ({ uri: photo.uri, label: '', mimeType: photo.mimeType })),
        );
      }
    } catch (err) {
      Alert.alert('Library Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function setLabel(idx: number, label: string) {
    const next = [...photos];
    next[idx] = { ...next[idx], label };
    onChange(next);
  }

  function removePhoto(idx: number) {
    onChange(photos.filter((_, i) => i !== idx));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Photos ({photos.length})</Text>
      <View style={styles.counterRow}>
        <Text style={styles.limitHint}>Max {MAX_TOTAL_PHOTOS} photos per survey</Text>
        <Text style={styles.counterBadge}>{photos.length}/{MAX_TOTAL_PHOTOS} ({photosRemaining} left)</Text>
      </View>

      {/* Photo grid */}
      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {photos.map((photo, idx) => (
            <View key={idx} style={styles.photoCard}>
              <Image source={{ uri: photo.uri }} style={styles.thumbnail} />

              {/* Remove button */}
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removePhoto(idx)}
                hitSlop={8}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>

              {/* Label input */}
              <TextInput
                style={styles.labelInput}
                placeholder="Add label…"
                placeholderTextColor={colors.textMuted}
                value={photo.label}
                onChangeText={t => setLabel(idx, t)}
              />
            </View>
          ))}
        </ScrollView>
      )}

      {/* Action buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleCamera}
          disabled={loading || atMaxPhotos}
        >
          <Text style={styles.btnText}>📷 Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleCameraMulti}
          disabled={loading || atMaxPhotos}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.btnText}>📸 Multi Camera</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.btnRow, styles.btnRowSecond]}>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, loading && styles.btnDisabled]}
          onPress={handleLibrary}
          disabled={loading || atMaxPhotos}
        >
          <Text style={[styles.btnText, styles.btnTextSecondary]}>🖼 Library</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, loading && styles.btnDisabled]}
          onPress={handleLibraryMulti}
          disabled={loading || atMaxPhotos}
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.btnText, styles.btnTextSecondary]}>🗂 Multi Library</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  limitHint: { color: colors.textMuted, fontSize: 12, marginBottom: 10 },
  counterBadge: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoRow:     { marginBottom: 10 },
  photoCard: {
    width:       140,
    marginRight:  10,
    position:    'relative',
  },
  thumbnail: {
    width:        140,
    height:       100,
    borderRadius:  8,
    backgroundColor: colors.inputBg,
  },
  removeBtn: {
    position:        'absolute',
    top:              4,
    right:            4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius:    12,
    width:            24,
    height:           24,
    alignItems:      'center',
    justifyContent:  'center',
  },
  removeBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  labelInput: {
    borderWidth:  1,
    borderColor:  colors.inputBorder,
    borderRadius:  6,
    paddingHorizontal: 8,
    paddingVertical:   4,
    fontSize:      12,
    color:         colors.textPrimary,
    backgroundColor: colors.inputBg,
    marginTop:     4,
    minHeight:     32,
  },
  btnRow:    { flexDirection: 'row', gap: 10 },
  btnRowSecond: { marginTop: 10 },
  btn: {
    flex:            1,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius:    10,
    alignItems:      'center',
    minHeight:       48,
    justifyContent:  'center',
  },
  btnSecondary:     { backgroundColor: colors.inputBg, borderWidth: 1.5, borderColor: colors.primary },
  btnDisabled:      { opacity: 0.5 },
  btnText:          { color: colors.background, fontSize: 14, fontWeight: '700' },
  btnTextSecondary: { color: colors.primary },
});
