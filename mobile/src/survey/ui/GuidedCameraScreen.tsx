// ============================================================
// Guided camera: the framing guide sits over the live view, one tap
// takes the photo, the blur check runs right away, and the camera moves
// on to the next photo the step still needs — no leaving the app.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconButton, ReasonSheet } from "../../ui/components";
import { FramingGuide } from "../../ui/FramingGuide";
import { color, radius, space } from "../../ui/theme";
import { findSlot } from "../blueprint";
import { currentFix, fileAsset, readExif } from "../capture";
import type { CapturedPhoto, SurveyDoc } from "../model";
import { nextNeededShot, photosForSlot, stepShots, type ShotTarget } from "../progress";
import { flagMessage } from "../quality";
import { loadPhotos, loadSurvey, removePhoto, updatePhoto } from "../repo";

// expo-camera zoom is a fraction of each phone's maximum, so label by intent.
const ZOOMS = [
  { label: "1×", value: 0 },
  { label: "Zoom +", value: 0.12 },
  { label: "Zoom ++", value: 0.35 },
];

type Result = { photo: CapturedPhoto; blurry: boolean } | null;

export function GuidedCameraScreen({
  surveyId,
  slotId,
  planeId,
}: {
  surveyId: string;
  slotId: string;
  planeId: string | null;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = React.useRef<CameraView>(null);

  const [doc, setDoc] = React.useState<SurveyDoc | null>(null);
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const [target, setTarget] = React.useState<ShotTarget | null>(null);
  const [zoom, setZoom] = React.useState(0);
  const [torch, setTorch] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result>(null);
  const [ready, setReady] = React.useState(false);
  const [showGuide, setShowGuide] = React.useState(true);
  const [shotCount, setShotCount] = React.useState(0);
  const [keepOpen, setKeepOpen] = React.useState(false);
  // The flagged photo a retake replaces. It stays saved until the new shot is.
  const retakeOf = React.useRef<{ photo: CapturedPhoto; reason: string } | null>(null);

  // Keep position and compass live while the camera is open, so a shot never
  // waits on a GPS fix.
  const fixRef = React.useRef<{ gps: CapturedPhoto["gps"]; heading: number | null }>({ gps: null, heading: null });
  React.useEffect(() => {
    const subs: { remove: () => void }[] = [];
    void (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return;
        subs.push(
          await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 1 }, (pos) => {
            fixRef.current.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude ?? null };
          }),
        );
        subs.push(
          await Location.watchHeadingAsync((h) => {
            const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
            if (deg >= 0) fixRef.current.heading = Math.round(deg) % 360;
          }),
        );
      } catch {
        // location is optional
      }
    })();
    return () => subs.forEach((sub) => sub.remove());
  }, []);

  React.useEffect(() => {
    void (async () => {
      const loaded = await loadSurvey(surveyId);
      if (!loaded) return;
      setDoc(loaded.survey.doc);
      setPhotos(loaded.photos);
      const found = findSlot(slotId);
      if (found) {
        setTarget({
          slot: found.slot,
          planeId,
          sectionTitle: planeId ? `Roof plane ${planeId}` : found.section.title,
        });
      }
    })();
  }, [surveyId, slotId, planeId]);

  if (!permission) return <View style={s.root} />;
  if (!permission.granted) {
    return (
      <View style={[s.root, s.center, { padding: space.xl }]}>
        <Ionicons name="camera-outline" size={56} color={color.amber} />
        <Text style={s.permTitle}>Camera access needed</Text>
        <Text style={s.permBody}>The survey takes photos inside the app so each one lands in the right spot.</Text>
        <Button label="Allow camera" onPress={() => void requestPermission()} style={{ alignSelf: "stretch", marginTop: space.lg }} />
        <Button label="Back" kind="ghost" onPress={() => router.back()} style={{ alignSelf: "stretch" }} />
      </View>
    );
  }
  if (!doc || !target) return <View style={s.root} />;

  const found = findSlot(target.slot.id)!;
  const shots = stepShots(doc, photos, found.step.id);
  const left = shots.filter((x) => x.needed).length;
  const inSlot = photosForSlot(photos, target.slot.id, target.planeId).filter((p) => p.qualityStatus !== "rejected").length;
  const max = target.slot.max ?? 1;

  const goNext = (latest: CapturedPhoto[]) => {
    const next = nextNeededShot(doc, latest, found.step.id, { slotId: target.slot.id, planeId: target.planeId });
    setResult(null);
    retakeOf.current = null;
    if (next) {
      setTarget(next);
      setZoom(0);
      setShowGuide(true);
    } else {
      router.back();
    }
  };

  const shoot = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 1, exif: true, shutterSound: true });
      const exif = readExif(pic.exif as Record<string, unknown> | undefined);
      const live = fixRef.current.gps || fixRef.current.heading !== null ? fixRef.current : await currentFix();
      const filed = await fileAsset(
        { uri: pic.uri, width: pic.width, height: pic.height },
        {
          surveyId,
          slotId: target.slot.id,
          planeId: target.planeId,
          retakeOf: retakeOf.current ? { photoId: retakeOf.current.photo.id, reason: retakeOf.current.reason } : null,
        },
        photos,
        { gps: exif.gps ?? live.gps, heading: live.heading },
      );
      // Replacement saved: now the flagged original can go.
      if (retakeOf.current) {
        await removePhoto(retakeOf.current.photo).catch(() => undefined);
        retakeOf.current = null;
      }
      const latest = await loadPhotos(surveyId);
      setPhotos(latest);
      setShotCount((n) => n + 1);
      setResult(filed);
      void Haptics.notificationAsync(
        filed.blurry ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
      );
      // Sharp single-photo slot: move straight on.
      if (!filed.blurry && max === 1) setTimeout(() => goNext(latest), 650);
    } catch (e) {
      setResult(null);
      Alert.alert("Photo not saved", `${e instanceof Error ? e.message : String(e)}\n\nTry again.`);
    } finally {
      setBusy(false);
    }
  };

  const retake = async () => {
    if (result) {
      // The next shot replaces this one and must not be compared with it.
      // Kept on disk until the replacement saves, so a failed or abandoned
      // retake never loses the only photo of this slot.
      retakeOf.current = { photo: result.photo, reason: (result.photo.qualityFlags ?? ["blurry"]).join(", ") };
    }
    setResult(null);
  };

  const keepFlagged = async (reason: string) => {
    if (!result) return;
    setKeepOpen(false);
    await updatePhoto(result.photo.id, { qualityStatus: "pending_review", notes: reason });
    goNext(await loadPhotos(surveyId));
  };

  return (
    <View style={s.root}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={zoom}
        enableTorch={torch}
        animateShutter
        onCameraReady={() => setReady(true)}
      />

      {showGuide && !result ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center]}>
          {/* A dim panel behind the lines keeps the guide readable on bright scenes. */}
          <View style={{ backgroundColor: "rgba(0,0,0,0.28)", borderRadius: radius.lg, padding: space.sm }}>
            <FramingGuide id={target.slot.guide} size={300} />
          </View>
        </View>
      ) : null}

      <View style={[s.top, { paddingTop: insets.top + space.xs }]}>
        <IconButton icon="close" label="Close camera" onPress={() => router.back()} tint="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>
            {found.step.short} · {target.sectionTitle}
            {max > 1 ? ` · ${inSlot}/${max}` : ""}
          </Text>
          <Text style={s.title} numberOfLines={1}>
            {target.slot.label}
            {target.slot.required ? "" : " (optional)"}
          </Text>
          <Text style={s.hint} numberOfLines={2}>
            {target.slot.hint}
          </Text>
        </View>
        <IconButton
          icon={showGuide ? "eye-outline" : "eye-off-outline"}
          label={showGuide ? "Hide framing guide" : "Show framing guide"}
          onPress={() => setShowGuide((v) => !v)}
          tint="#fff"
        />
      </View>

      {result ? (
        <View style={[s.result, result.blurry ? s.resultWarn : s.resultGood]}>
          <Ionicons name={result.blurry ? "eye-off" : "checkmark-circle"} size={28} color={result.blurry ? color.onAmber : "#04210F"} />
          <Text style={[s.resultText, { color: result.blurry ? color.onAmber : "#04210F" }]}>
            {result.blurry
              ? `${flagMessage(result.photo.qualityFlags ?? ["blurry"], result.photo.slotId)} Retake while you’re here?`
              : `Saved: ${target.slot.label}`}
          </Text>
        </View>
      ) : null}

      <View style={[s.bottom, { paddingBottom: insets.bottom + space.md }]}>
        {result?.blurry ? (
          <View style={s.row}>
            <Button label="Keep…" kind="secondary" onPress={() => setKeepOpen(true)} style={{ flex: 1 }} />
            <Button label="Retake" icon="camera-reverse" onPress={() => void retake()} style={{ flex: 1.4 }} />
          </View>
        ) : (
          <>
            <View style={s.controls}>
              {ZOOMS.map((z) => (
                <Pressable
                  key={z.label}
                  onPress={() => setZoom(z.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Zoom ${z.label}`}
                  accessibilityState={{ selected: zoom === z.value }}
                  style={[s.zoom, zoom === z.value && s.zoomOn]}
                >
                  <Text style={[s.zoomText, zoom === z.value && { color: color.onAmber }]}>{z.label}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setTorch((t) => !t)}
                accessibilityRole="button"
                accessibilityLabel={torch ? "Turn light off" : "Turn light on"}
                style={[s.zoom, torch && s.zoomOn]}
              >
                <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={20} color={torch ? color.onAmber : "#fff"} />
              </Pressable>
            </View>
            <View style={s.row}>
              <View style={s.side}>
                <Text style={s.count}>{left === 0 ? "Step covered" : `${left} left`}</Text>
                <Text style={s.countSub}>{shotCount ? `${shotCount} taken` : found.step.title}</Text>
              </View>
              <Pressable
                testID="shutter"
                onPress={() => void shoot()}
                disabled={!ready || busy}
                accessibilityRole="button"
                accessibilityLabel={`Take ${target.slot.label} photo`}
                style={({ pressed }) => [s.shutter, (pressed || busy) && { transform: [{ scale: 0.94 }] }]}
              >
                {busy ? <ActivityIndicator color={color.onAmber} /> : <View style={s.shutterInner} />}
              </Pressable>
              <Pressable
                onPress={() => goNext(photos)}
                accessibilityRole="button"
                accessibilityLabel={result && max > 1 ? "Next photo" : "Skip to next photo"}
                style={s.side}
              >
                <Text style={s.skip}>{result && max > 1 ? "Next" : "Skip"}</Text>
                <Ionicons name="play-skip-forward" size={22} color="#fff" />
              </Pressable>
            </View>
          </>
        )}
      </View>
      <ReasonSheet
        visible={keepOpen}
        title="Keep this photo"
        prompt="Why keep it as is? This note goes to the design team with the photo."
        suggestions={["Best possible in this light", "Label is still readable", "No label on this equipment", "Different angle on purpose"]}
        confirmLabel="Keep photo"
        onCancel={() => setKeepOpen(false)}
        onConfirm={(r) => void keepFlagged(r)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center" },
  permTitle: { color: color.text, fontSize: 22, fontWeight: "800", marginTop: space.md },
  permBody: { color: color.textDim, fontSize: 17, textAlign: "center", marginTop: space.sm },
  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xs,
    paddingHorizontal: space.xs,
    paddingBottom: space.md,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  kicker: { color: color.amber, fontSize: 14, fontWeight: "800", marginTop: 6 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800" },
  hint: { color: "#E5ECF8", fontSize: 15, marginTop: 2 },
  result: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    bottom: 230,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    padding: space.md,
  },
  resultGood: { backgroundColor: "#3DD68C" },
  resultWarn: { backgroundColor: color.amber },
  resultText: { flex: 1, fontSize: 17, fontWeight: "800" },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  controls: { flexDirection: "row", justifyContent: "center", gap: space.sm },
  zoom: {
    minWidth: 52,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  zoomOn: { backgroundColor: color.amber },
  zoomText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  side: { width: 96, minHeight: 56, alignItems: "center", justifyContent: "center" },
  count: { color: "#fff", fontSize: 17, fontWeight: "800" },
  countSub: { color: "#C7D2E6", fontSize: 13 },
  skip: { color: "#fff", fontSize: 15, fontWeight: "700" },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.amber },
});
