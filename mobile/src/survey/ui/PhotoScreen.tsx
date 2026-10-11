// ============================================================
// One photo: view, mark up, notes, retake, delete.
// Markup is saved as a separate copy (and as editable vectors); the
// original is never changed.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Button, IconButton, Input, ReasonSheet, T } from "../../ui/components";
import { color, radius, space } from "../../ui/theme";
import { findSlot } from "../blueprint";
import { discardMarkupFile, storeMarkup, takePhoto } from "../capture";
import type { CapturedPhoto } from "../model";
import { BLUR_THRESHOLD, flagLabels } from "../quality";
import { absPath, loadPhotos, loadSurvey, removePhoto, updatePhoto } from "../repo";
import { MarkupEditor, type Mark } from "./MarkupEditor";

const RETAKE_REASONS = ["Blurry", "Wrong framing", "Glare", "Missed detail"];

function compass(deg: number | null): string {
  if (deg === null) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `${deg}° ${dirs[Math.round(deg / 45) % 8]}`;
}

export function PhotoScreen({ surveyId, photoId }: { surveyId: string; photoId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [photo, setPhoto] = React.useState<CapturedPhoto | null>(null);
  const [locked, setLocked] = React.useState(false);
  const [size, setSize] = React.useState<{ w: number; h: number }>({ w: 1600, h: 1200 });
  const [editing, setEditing] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [retakeOpen, setRetakeOpen] = React.useState(false);

  const notesTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRef = React.useRef("");
  notesRef.current = notes;
  // Flush a pending note when leaving the screen.
  React.useEffect(
    () => () => {
      if (notesTimer.current) {
        clearTimeout(notesTimer.current);
        void updatePhoto(photoId, { notes: notesRef.current });
      }
    },
    [photoId],
  );

  const load = React.useCallback(async () => {
    const [all, s] = await Promise.all([loadPhotos(surveyId), loadSurvey(surveyId)]);
    const p = all.find((x) => x.id === photoId) ?? null;
    setPhoto(p);
    setLocked(s?.survey.status === "submitted");
    if (p) {
      setNotes(p.notes);
      Image.getSize(absPath(p.relPath), (w, h) => w && h && setSize({ w, h }), () => undefined);
    }
  }, [surveyId, photoId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!photo) return <View style={s.root} />;

  const found = findSlot(photo.slotId);
  const aspect = size.w / size.h;
  const viewH = Math.min(width / aspect, width * 1.4);
  const flags = photo.qualityFlags?.length ? photo.qualityFlags : ["blurry"];

  const doRetake = async (reason: string) => {
    setRetakeOpen(false);
    const existing = await loadPhotos(surveyId);
    const res = await takePhoto(
      { surveyId, slotId: photo.slotId, planeId: photo.planeId, retakeOf: { photoId: photo.id, reason } },
      existing,
    );
    if (res.kind === "captured") {
      await removePhoto(photo);
      router.replace(`/survey/${surveyId}/photo/${res.photo.id}`);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.top, { paddingTop: insets.top }]}>
        <IconButton icon="chevron-back" label="Back to survey" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <T variant="title" numberOfLines={1}>
            {found ? `${photo.planeId ? `Plane ${photo.planeId} · ` : ""}${found.slot.label}` : photo.slotId}
          </T>
          <T variant="caption" muted>
            {found ? `Step ${found.step.number} · ${found.step.title}` : ""}
          </T>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} scrollEnabled={!editing}>
        {editing ? (
          <MarkupEditor
            uri={absPath(photo.relPath)}
            displayWidth={width}
            aspect={aspect}
            pixelWidth={size.w}
            initial={(photo.markup as Mark[] | undefined) ?? []}
            onCancel={() => setEditing(false)}
            onSave={async (marks, tmp) => {
              try {
                const rel = marks.length ? await storeMarkup(photo, tmp) : null;
                if (!rel && photo.annotatedRelPath) await discardMarkupFile(photo.annotatedRelPath);
                await updatePhoto(photo.id, { annotatedRelPath: rel, markup: marks.length ? marks : null });
                setEditing(false);
                await load();
              } catch (e) {
                Alert.alert("Markup not saved", e instanceof Error ? e.message : String(e));
              }
            }}
          />
        ) : (
          <>
            <Image
              source={{ uri: absPath(photo.annotatedRelPath ?? photo.relPath) }}
              style={{ width, height: viewH, backgroundColor: "#000" }}
              resizeMode="contain"
              accessibilityLabel={`${found?.slot.label ?? "Survey"} photo${photo.annotatedRelPath ? ", marked up" : ""}`}
            />
            <View style={{ padding: space.lg, gap: space.lg }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {photo.qualityStatus === "pending_review" ? (
                  <Badge label={`Flagged: ${flagLabels(flags)}`} tone="warn" icon="alert-circle" />
                ) : (
                  // Only "passed" when every check actually ran.
                  photo.contentCheck === "unavailable" || photo.contentCheck === "failed" ? (
                    <Badge label="Partly checked" tone="neutral" icon="checkmark" />
                  ) : (
                    <Badge label="Passed checks" tone="good" icon="checkmark" />
                  )
                )}
                {photo.annotatedRelPath ? <Badge label="Marked up" tone="info" icon="brush" /> : null}
                <Badge
                  label={photo.uploadState === "uploaded" ? "Uploaded" : "On this phone"}
                  tone={photo.uploadState === "uploaded" ? "good" : "neutral"}
                />
              </View>

              <View style={s.meta}>
                <MetaRow icon="time-outline" label="Taken" value={new Date(photo.capturedAt).toLocaleString()} />
                <MetaRow
                  icon="location-outline"
                  label="GPS"
                  value={photo.gps ? `${photo.gps.lat.toFixed(5)}, ${photo.gps.lng.toFixed(5)}` : "Not available"}
                />
                <MetaRow icon="compass-outline" label="Facing" value={compass(photo.heading)} />
                <MetaRow
                  icon="aperture-outline"
                  label="Sharpness"
                  value={photo.blurScore === null ? "Not measured" : `${Math.round(photo.blurScore)} (blurry below ${BLUR_THRESHOLD})`}
                />
                <MetaRow icon="resize-outline" label="Size" value={`${size.w} × ${size.h}`} />
                {photo.detectedText ? (
                  <MetaRow icon="scan-outline" label="Text read" value={photo.detectedText.replace(/\s+/g, " ").slice(0, 160)} />
                ) : null}
                {photo.contentCheck === "unavailable" ? (
                  <MetaRow icon="eye-off-outline" label="Content check" value="Not available on this phone (sharpness, light and duplicates still checked)" />
                ) : photo.contentCheck === "failed" ? (
                  <MetaRow icon="eye-off-outline" label="Content check" value="Couldn't check this photo (sharpness, light and duplicates still checked)" />
                ) : photo.contentCheck === "checked" ? (
                  <MetaRow
                    icon="eye-outline"
                    label="Content check"
                    value={(photo.qualityFlags ?? []).some((f) => f === "no_text" || f === "off_subject" || f === "wrong_subject") ? "Flagged — see above" : "Passed"}
                  />
                ) : null}
                {photo.retakeReason ? <MetaRow icon="refresh" label="Retake of" value={photo.retakeReason} /> : null}
              </View>

              <View>
                <T variant="small" dim style={{ fontWeight: "700", marginBottom: space.sm }}>
                  {photo.qualityStatus === "pending_review" ? "Why keep this photo as is? (required)" : "Note for the designer"}
                </T>
                <Input
                  label="Photo note"
                  value={notes}
                  editable={!locked}
                  onChangeText={(t) => {
                    setNotes(t);
                    // Saved as you type, so the back button can't lose it.
                    if (notesTimer.current) clearTimeout(notesTimer.current);
                    notesTimer.current = setTimeout(() => void updatePhoto(photo.id, { notes: t }), 300);
                  }}
                  onBlur={() => void updatePhoto(photo.id, { notes })}
                  placeholder="e.g. 200 A main, label behind the dead front"
                  multiline
                />
              </View>

              {!locked ? (
                <View style={{ gap: space.sm }}>
                  <Button
                    label={photo.annotatedRelPath ? "Edit markup" : "Mark up photo"}
                    icon="brush"
                    kind="secondary"
                    onPress={() => setEditing(true)}
                  />
                  <Button label="Retake" icon="camera-reverse" kind="secondary" onPress={() => setRetakeOpen(true)} />
                  <Button
                    label="Delete photo"
                    icon="trash-outline"
                    kind="danger"
                    onPress={() =>
                      Alert.alert("Delete this photo?", "It is removed from this phone and the survey.", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: async () => {
                            await removePhoto(photo);
                            router.back();
                          },
                        },
                      ])
                    }
                  />
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <ReasonSheet
        visible={retakeOpen}
        title="Retake photo"
        prompt="Why retake? The new photo replaces this one and keeps the reason."
        suggestions={RETAKE_REASONS}
        confirmLabel="Open camera"
        onCancel={() => setRetakeOpen(false)}
        onConfirm={(r) => void doRetake(r)}
      />
    </KeyboardAvoidingView>
  );
}

function MetaRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Ionicons name={icon} size={18} color={color.textMuted} />
      <T variant="small" muted style={{ width: 96 }}>
        {label}
      </T>
      <T variant="small" style={{ flex: 1 }}>
        {value}
      </T>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  top: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    paddingRight: space.lg,
  },
  meta: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    borderWidth: 1,
    borderColor: color.border,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
