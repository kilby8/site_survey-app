/**
 * components/ChecklistEditor.tsx
 *
 * Renders a list of checklist items with pass/fail/n-a/pending toggles.
 * Supports adding custom items, editing notes inline, and capturing photos per item.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import type { ChecklistStatus } from "../types";
import { captureFromCamera, pickFromLibrary } from "../services/photoService";
import { solarProTheme } from "../theme/solarProTheme";

const { colors } = solarProTheme;

export interface ChecklistItemPhoto {
  uri: string;
  label: string;
  mimeType: string;
}

export interface ChecklistItemDraft {
  label: string;
  status: ChecklistStatus;
  notes: string;
  photos?: ChecklistItemPhoto[];
}

interface Props {
  items: ChecklistItemDraft[];
  onChange: (items: ChecklistItemDraft[]) => void;
}

const STATUS_OPTIONS: {
  value: ChecklistStatus;
  label: string;
  color: string;
}[] = [
  { value: "pass", label: "✓ Pass", color: "#16a34a" },
  { value: "fail", label: "✗ Fail", color: "#dc2626" },
  { value: "n/a", label: "— N/A", color: "#6b7280" },
  { value: "pending", label: "? Pending", color: "#f59e0b" },
];

export default function ChecklistEditor({ items, onChange }: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [loadingItemIdx, setLoadingItemIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  function setStatus(idx: number, status: ChecklistStatus) {
    const next = [...items];
    next[idx] = { ...next[idx], status };
    onChange(next);
  }

  function setNotes(idx: number, notes: string) {
    const next = [...items];
    next[idx] = { ...next[idx], notes };
    onChange(next);
  }

  async function capturePhotoForItem(idx: number) {
    setLoadingItemIdx(idx);
    try {
      const photo = await captureFromCamera();
      if (photo) {
        const next = [...items];
        const photos = next[idx].photos ?? [];
        next[idx] = {
          ...next[idx],
          photos: [
            ...photos,
            { uri: photo.uri, label: "", mimeType: photo.mimeType },
          ],
        };
        onChange(next);
      }
    } catch (err) {
      Alert.alert(
        "Camera Error",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoadingItemIdx(null);
    }
  }

  async function pickPhotoForItem(idx: number) {
    setLoadingItemIdx(idx);
    try {
      const photo = await pickFromLibrary();
      if (photo) {
        const next = [...items];
        const photos = next[idx].photos ?? [];
        next[idx] = {
          ...next[idx],
          photos: [
            ...photos,
            { uri: photo.uri, label: "", mimeType: photo.mimeType },
          ],
        };
        onChange(next);
      }
    } catch (err) {
      Alert.alert(
        "Library Error",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoadingItemIdx(null);
    }
  }

  function setPhotoLabel(itemIdx: number, photoIdx: number, label: string) {
    const next = [...items];
    const photos = [...(next[itemIdx].photos ?? [])];
    photos[photoIdx] = { ...photos[photoIdx], label };
    next[itemIdx] = { ...next[itemIdx], photos };
    onChange(next);
  }

  function removePhoto(itemIdx: number, photoIdx: number) {
    const next = [...items];
    const photos = next[itemIdx].photos?.filter((_, i) => i !== photoIdx) ?? [];
    next[itemIdx] = { ...next[itemIdx], photos };
    onChange(next);
  }

  function addItem() {
    const label = newLabel.trim();
    if (!label) return;
    onChange([...items, { label, status: "pending", notes: "", photos: [] }]);
    setNewLabel("");
  }

  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Checklist</Text>

      {items.map((item, idx) => {
        const opt =
          STATUS_OPTIONS.find((o) => o.value === item.status) ??
          STATUS_OPTIONS[3];
        const itemPhotos = item.photos ?? [];
        const isExpanded = expandedIdx === idx;
        return (
          <View key={idx} style={styles.item}>
            {/* Label + remove */}
            <View style={styles.itemHeader}>
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => setExpandedIdx(isExpanded ? null : idx)}
              >
                <Text style={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</Text>
              </TouchableOpacity>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <TouchableOpacity onPress={() => removeItem(idx)} hitSlop={8}>
                <Text style={styles.removeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Status buttons */}
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={[
                    styles.statusBtn,
                    item.status === o.value && {
                      backgroundColor: o.color,
                      borderColor: o.color,
                    },
                  ]}
                  onPress={() => setStatus(idx, o.value)}
                >
                  <Text
                    style={[
                      styles.statusBtnText,
                      item.status === o.value && styles.statusBtnTextActive,
                    ]}
                  >
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status indicator */}
            <View
              style={[styles.statusIndicator, { backgroundColor: opt.color }]}
            >
              <Text style={styles.statusIndicatorText}>{opt.label}</Text>
            </View>

            {/* Notes input */}
            <TextInput
              style={styles.notesInput}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.textMuted}
              value={item.notes}
              onChangeText={(t) => setNotes(idx, t)}
              multiline
            />

            {/* Expanded section with photos and camera */}
            {isExpanded && (
              <View style={styles.expandedSection}>
                {/* Photos gallery */}
                {itemPhotos.length > 0 && (
                  <View style={styles.photosGallery}>
                    <Text style={styles.photosTitle}>
                      Photos ({itemPhotos.length})
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.photoRow}
                    >
                      {itemPhotos.map((photo, photoIdx) => (
                        <View key={photoIdx} style={styles.photoCard}>
                          <Image
                            source={{ uri: photo.uri }}
                            style={styles.thumbnail}
                          />
                          <TouchableOpacity
                            style={styles.photoRemoveBtn}
                            onPress={() => removePhoto(idx, photoIdx)}
                            hitSlop={6}
                          >
                            <Text style={styles.photoRemoveBtnText}>✕</Text>
                          </TouchableOpacity>
                          <TextInput
                            style={styles.photoLabelInput}
                            placeholder="Label…"
                            placeholderTextColor={colors.textMuted}
                            value={photo.label}
                            onChangeText={(t) =>
                              setPhotoLabel(idx, photoIdx, t)
                            }
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Camera controls */}
                <View style={styles.cameraRow}>
                  <TouchableOpacity
                    style={[
                      styles.cameraBtn,
                      loadingItemIdx === idx && styles.cameraBtnDisabled,
                    ]}
                    onPress={() => capturePhotoForItem(idx)}
                    disabled={loadingItemIdx === idx}
                  >
                    {loadingItemIdx === idx ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.cameraBtnText}>📷 Camera</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.cameraBtn,
                      styles.cameraBtnSecondary,
                      loadingItemIdx === idx && styles.cameraBtnDisabled,
                    ]}
                    onPress={() => pickPhotoForItem(idx)}
                    disabled={loadingItemIdx === idx}
                  >
                    {loadingItemIdx === idx ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text
                        style={[
                          styles.cameraBtnText,
                          styles.cameraBtnTextSecondary,
                        ]}
                      >
                        🖼 Library
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* Add new item */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Add checklist item…"
          placeholderTextColor={colors.textMuted}
          value={newLabel}
          onChangeText={setNewLabel}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, !newLabel.trim() && styles.addBtnDisabled]}
          onPress={addItem}
          disabled={!newLabel.trim()}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  item: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary, flex: 1 },
  removeBtn: { fontSize: 14, color: colors.textMuted, paddingLeft: 8 },
  statusRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 6,
  },
  statusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    minHeight: 36,
    justifyContent: "center",
  },
  statusBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  statusBtnTextActive: { color: "#ffffff" },
  statusIndicator: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 6,
  },
  statusIndicatorText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    color: colors.textSecondary,
    backgroundColor: colors.inputBg,
    minHeight: 36,
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.inputBg,
    minHeight: 44,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
  },
  addBtnDisabled: { backgroundColor: colors.primaryDark },
  addBtnText: { color: colors.background, fontWeight: "700", fontSize: 14 },
  expandBtn: {
    paddingRight: 8,
  },
  expandIcon: {
    fontSize: 12,
    color: colors.textMuted,
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  photosGallery: {
    marginBottom: 12,
  },
  photosTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
  },
  photoRow: {
    marginBottom: 10,
  },
  photoCard: {
    width: 120,
    marginRight: 10,
    position: "relative",
  },
  thumbnail: {
    width: 120,
    height: 90,
    borderRadius: 6,
    backgroundColor: colors.inputBg,
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 3,
    right: 3,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  photoLabelInput: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 4,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: colors.inputBg,
  },
  cameraRow: {
    flexDirection: "row",
    gap: 8,
  },
  cameraBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBtnSecondary: {
    backgroundColor: colors.inputBg,
  },
  cameraBtnDisabled: {
    opacity: 0.6,
  },
  cameraBtnText: {
    color: colors.background,
    fontWeight: "600",
    fontSize: 13,
  },
  cameraBtnTextSecondary: {
    color: colors.primary,
  },
});
