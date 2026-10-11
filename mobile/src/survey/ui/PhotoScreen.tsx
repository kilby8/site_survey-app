// ============================================================
// One photo: view, mark up (pen + text), notes, retake, delete.
// Markup is saved as a separate copy; the original is never changed.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { Badge, Button, IconButton, Input, ReasonSheet, Sheet, T } from "../../ui/components";
import { color, radius, space } from "../../ui/theme";
import { findSlot } from "../blueprint";
import { storeMarkup, takePhoto } from "../capture";
import type { CapturedPhoto } from "../model";
import { BLUR_THRESHOLD } from "../quality";
import { absPath, loadPhotos, loadSurvey, removePhoto, updatePhoto } from "../repo";

type Mark =
  | { kind: "pen"; color: string; d: string }
  | { kind: "text"; color: string; x: number; y: number; text: string };

const INKS = [color.amber, "#FF4D5E", "#FFFFFF"];
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
  const [ratio, setRatio] = React.useState(4 / 3);
  const [editing, setEditing] = React.useState(false);
  const [ink, setInk] = React.useState(INKS[0]);
  const [tool, setTool] = React.useState<"pen" | "text">("pen");
  const [marks, setMarks] = React.useState<Mark[]>([]);
  const [live, setLive] = React.useState<string | null>(null);
  const [textAt, setTextAt] = React.useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [retakeOpen, setRetakeOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const canvas = React.useRef<View>(null);
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
  const liveRef = React.useRef<string | null>(null);

  const load = React.useCallback(async () => {
    const [all, s] = await Promise.all([loadPhotos(surveyId), loadSurvey(surveyId)]);
    const p = all.find((x) => x.id === photoId) ?? null;
    setPhoto(p);
    setLocked(s?.survey.status === "submitted");
    if (p) {
      setNotes(p.notes);
      Image.getSize(absPath(p.relPath), (w, h) => h && setRatio(w / h), () => undefined);
    }
  }, [surveyId, photoId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toolRef = React.useRef(tool);
  toolRef.current = tool;
  const inkRef = React.useRef(ink);
  inkRef.current = ink;

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (toolRef.current === "text") {
            setTextAt({ x, y });
            setTextValue("");
            return;
          }
          liveRef.current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
          setLive(liveRef.current);
        },
        onPanResponderMove: (e) => {
          if (toolRef.current !== "pen" || !liveRef.current) return;
          const { locationX: x, locationY: y } = e.nativeEvent;
          liveRef.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
          setLive(liveRef.current);
        },
        onPanResponderRelease: () => {
          if (toolRef.current === "pen" && liveRef.current) {
            const d = liveRef.current;
            setMarks((m) => [...m, { kind: "pen", color: inkRef.current, d }]);
          }
          liveRef.current = null;
          setLive(null);
        },
      }),
    [],
  );

  if (!photo) return <View style={s.root} />;

  const found = findSlot(photo.slotId);
  const imgW = width;
  const imgH = Math.min(width / ratio, width * 1.4);
  const shownUri = absPath(editing ? photo.relPath : photo.annotatedRelPath ?? photo.relPath);

  const saveMarkup = async () => {
    if (!canvas.current) return;
    setSaving(true);
    try {
      const tmp = await captureRef(canvas, { format: "jpg", quality: 0.9, result: "tmpfile" });
      const rel = await storeMarkup(photo, tmp);
      await updatePhoto(photo.id, { annotatedRelPath: rel });
      setEditing(false);
      setMarks([]);
      await load();
    } catch (e) {
      Alert.alert("Markup not saved", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

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
        <View ref={canvas} collapsable={false} style={{ width: imgW, height: imgH, backgroundColor: "#000" }}>
          <Image source={{ uri: shownUri }} style={{ width: imgW, height: imgH }} resizeMode="contain" />
          {editing ? (
            <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
              <Svg width={imgW} height={imgH}>
                {marks.map((m, i) =>
                  m.kind === "pen" ? (
                    <Path key={i} d={m.d} stroke={m.color} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <SvgText key={i} x={m.x} y={m.y} fill={m.color} fontSize={24} fontWeight="800" stroke="#000" strokeWidth={0.8}>
                      {m.text}
                    </SvgText>
                  ),
                )}
                {live ? <Path d={live} stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
              </Svg>
            </View>
          ) : null}
        </View>

        {editing ? (
          <View style={s.tools}>
            <View style={s.toolRow}>
              {(["pen", "text"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTool(t)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tool === t }}
                  accessibilityLabel={t === "pen" ? "Draw" : "Add text"}
                  style={[s.tool, tool === t && s.toolOn]}
                >
                  <Ionicons name={t === "pen" ? "brush" : "text"} size={22} color={tool === t ? color.onAmber : color.text} />
                  <Text style={[s.toolText, tool === t && { color: color.onAmber }]}>{t === "pen" ? "Draw" : "Text"}</Text>
                </Pressable>
              ))}
              {INKS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setInk(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ink ${c === color.amber ? "amber" : c === "#FFFFFF" ? "white" : "red"}`}
                  style={[s.swatch, { backgroundColor: c }, ink === c && s.swatchOn]}
                />
              ))}
              <IconButton icon="arrow-undo" label="Undo" onPress={() => setMarks((m) => m.slice(0, -1))} />
            </View>
            <T variant="caption" muted>
              {tool === "pen" ? "Drag on the photo to draw." : "Tap the photo where the text should go."}
            </T>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Cancel" kind="secondary" style={{ flex: 1 }} onPress={() => { setEditing(false); setMarks([]); }} />
              <Button label="Save markup" style={{ flex: 1.4 }} onPress={saveMarkup} busy={saving} disabled={!marks.length} />
            </View>
          </View>
        ) : (
          <View style={{ padding: space.lg, gap: space.lg }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {photo.qualityStatus === "pending_review" ? <Badge label="Flagged blurry" tone="warn" icon="eye-off" /> : <Badge label="Sharp" tone="good" icon="checkmark" />}
              {photo.annotatedRelPath ? <Badge label="Marked up" tone="info" icon="brush" /> : null}
              <Badge label={photo.uploadState === "uploaded" ? "Uploaded" : "On this phone"} tone={photo.uploadState === "uploaded" ? "good" : "neutral"} />
            </View>

            <View style={s.meta}>
              <MetaRow icon="time-outline" label="Taken" value={new Date(photo.capturedAt).toLocaleString()} />
              <MetaRow icon="location-outline" label="GPS" value={photo.gps ? `${photo.gps.lat.toFixed(5)}, ${photo.gps.lng.toFixed(5)}` : "Not available"} />
              <MetaRow icon="compass-outline" label="Facing" value={compass(photo.heading)} />
              <MetaRow
                icon="aperture-outline"
                label="Sharpness"
                value={photo.blurScore === null ? "Not measured" : `${Math.round(photo.blurScore)} (blurry below ${BLUR_THRESHOLD})`}
              />
              {photo.retakeReason ? <MetaRow icon="refresh" label="Retake of earlier photo" value={photo.retakeReason} /> : null}
            </View>

            <View>
              <T variant="small" dim style={{ fontWeight: "700", marginBottom: space.sm }}>
                {photo.qualityStatus === "pending_review" ? "Why keep this blurry photo? (required)" : "Note for the designer"}
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
                <Button label="Mark up photo" icon="brush" kind="secondary" onPress={() => setEditing(true)} />
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
        )}
      </ScrollView>

      <Sheet visible={!!textAt} onClose={() => setTextAt(null)} title="Add text">
        <Input label="Text on photo" value={textValue} onChangeText={setTextValue} placeholder="e.g. 24 in O.C." autoFocus />
        <Button
          label="Place text"
          style={{ marginTop: space.lg }}
          disabled={!textValue.trim()}
          onPress={() => {
            if (textAt) setMarks((m) => [...m, { kind: "text", color: ink, x: textAt.x, y: textAt.y, text: textValue.trim() }]);
            setTextAt(null);
          }}
        />
      </Sheet>

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
  tools: { padding: space.lg, gap: space.md, backgroundColor: color.surface },
  toolRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  tool: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.inputBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toolOn: { backgroundColor: color.amber, borderColor: color.amber },
  toolText: { color: color.text, fontWeight: "800", fontSize: 16 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: color.border },
  swatchOn: { borderColor: color.text, borderWidth: 3 },
  meta: { backgroundColor: color.surface, borderRadius: radius.md, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: color.border },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
