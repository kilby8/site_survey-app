import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  Image, Alert, StyleSheet,
} from 'react-native';
import { captureFromCamera, pickFromLibrary } from '../services/photoService';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

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

  async function handleCamera() {
    setLoading(true);
    try {
      const photo = await captureFromCamera();
      if (photo) {
        onChange([...photos, { uri: photo.uri, label: '', mimeType: photo.mimeType }]);
      }
    } catch (err) {
      Alert.alert('Camera Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLibrary() {
    setLoading(true);
    try {
      const photo = await pickFromLibrary();
      if (photo) {
        onChange([...photos, { uri: photo.uri, label: '', mimeType: photo.mimeType }]);
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
          disabled={loading}
        >
          <Text style={styles.btnText}>📷 Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, loading && styles.btnDisabled]}
          onPress={handleLibrary}
          disabled={loading}
        >
          <Text style={[styles.btnText, styles.btnTextSecondary]}>🖼 Library</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
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
