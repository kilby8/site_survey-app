// ============================================================
// Photo capture: camera → resize → blur check → Golden Block → SQLite.
//
// The capture context is written to storage before the camera opens.
// If Android kills the app while the camera is up, the capture screen
// recovers the photo with getPendingResultAsync() and files it in the
// right slot.
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import type { SurveyStepId } from "../types/pipeline";
import { findSlot } from "./blueprint";
import type { CapturedPhoto } from "./model";
import { nextCaptureOrder } from "./progress";
import { checkContent } from "./content";
import { analyzeJpegBase64, BLUR_SAMPLE_WIDTH, qualityFlags, type ImageAnalysis } from "./quality";
import { absPath, insertPhoto, newId, PHOTO_DIR } from "./repo";

const PENDING_KEY = "site-survey.pending-capture.v1";
/** Long edge kept for uploads: plenty for reading labels, ~1–2 MB per photo. */
const MAX_EDGE = 2560;

export interface CaptureTarget {
  surveyId: string;
  slotId: string;
  planeId: string | null;
  /** Set when replacing an existing photo. */
  retakeOf?: { photoId: string; reason: string } | null;
}

export type CaptureResult =
  | { kind: "cancelled" }
  | { kind: "denied" }
  | { kind: "captured"; photo: CapturedPhoto; blurry: boolean };

async function ensureDir(): Promise<void> {
  const dir = absPath(PHOTO_DIR);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Best-effort location and compass at the shutter; never blocks capture for long. */
export async function currentFix(): Promise<{
  gps: CapturedPhoto["gps"];
  heading: number | null;
}> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return { gps: null, heading: null };
    const pos =
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 4000)) ??
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }));
    const head = await withTimeout(Location.getHeadingAsync(), 1500);
    const deg = head ? (head.trueHeading >= 0 ? head.trueHeading : head.magHeading) : null;
    return {
      gps: pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude ?? null } : null,
      heading: deg !== null && deg >= 0 ? Math.round(deg) : null,
    };
  } catch {
    return { gps: null, heading: null };
  }
}

type Exif = Record<string, unknown> | null | undefined;

function exifNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** GPS and shutter time recorded by the camera, when present. */
export function readExif(exif: Exif): { gps: CapturedPhoto["gps"]; takenAt: string | null } {
  if (!exif) return { gps: null, takenAt: null };
  let lat = exifNumber(exif.GPSLatitude);
  let lng = exifNumber(exif.GPSLongitude);
  if (lat !== null && String(exif.GPSLatitudeRef ?? "N").toUpperCase().startsWith("S")) lat = -Math.abs(lat);
  if (lng !== null && String(exif.GPSLongitudeRef ?? "E").toUpperCase().startsWith("W")) lng = -Math.abs(lng);
  const gps = lat !== null && lng !== null && !(lat === 0 && lng === 0) ? { lat, lng, alt: exifNumber(exif.GPSAltitude) } : null;
  let takenAt: string | null = null;
  const raw = exif.DateTimeOriginal ?? exif.DateTime;
  if (typeof raw === "string") {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
      if (!Number.isNaN(d.getTime())) takenAt = d.toISOString();
    }
  }
  return { gps, takenAt };
}

/** Sharpness, brightness and hash from a small copy. null if it can't be measured. */
export async function analyzeImage(uri: string): Promise<ImageAnalysis | null> {
  try {
    const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: BLUR_SAMPLE_WIDTH } }], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    return small.base64 ? analyzeJpegBase64(small.base64) : null;
  } catch {
    return null;
  }
}

const CONTENT_EDGE = 1280;

/** A 1280 px copy for the content check. null: use the original. */
async function contentCopy(uri: string): Promise<string | null> {
  try {
    const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: CONTENT_EDGE } }], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return out.uri;
  } catch {
    return null;
  }
}

/** What fileAsset needs from a camera/library image. */
export interface RawImage {
  uri: string;
  width?: number;
  height?: number;
}

async function storeImage(asset: RawImage, photoId: string): Promise<string> {
  await ensureDir();
  const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  const actions: ImageManipulator.Action[] = [];
  if (longEdge > MAX_EDGE) {
    actions.push({
      resize: (asset.width ?? 0) >= (asset.height ?? 0) ? { width: MAX_EDGE } : { height: MAX_EDGE },
    });
  }
  const out = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const rel = `${PHOTO_DIR}${photoId}.jpg`;
  await FileSystem.moveAsync({ from: out.uri, to: absPath(rel) });
  return rel;
}

/** File an image into a slot with its Golden Block. */
export async function fileAsset(
  asset: RawImage,
  target: CaptureTarget,
  existing: CapturedPhoto[],
  fix?: { gps: CapturedPhoto["gps"]; heading: number | null },
  takenAt?: string | null,
): Promise<{ photo: CapturedPhoto; blurry: boolean }> {
  const found = findSlot(target.slotId);
  if (!found) throw new Error(`Unknown photo slot ${target.slotId}`);
  const id = newId();
  const capturedAt = takenAt ?? new Date().toISOString();
  const [where, relPath] = await Promise.all([fix ?? currentFix(), storeImage(asset, id)]);
  // Quality analysis and the content check run side by side; ML Kit reads a
  // 1280 px copy (enough for meter digits, ~4× fewer pixels than the upload).
  const [analysis, content] = await Promise.all([
    analyzeImage(absPath(relPath)),
    contentCopy(absPath(relPath)).then(async (uri) => {
      try {
        return await checkContent(target.slotId, uri ?? absPath(relPath));
      } finally {
        if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
    }),
  ]);
  // Duplicate check: not against the photo being retaken, and not against the
  // same slot on another roof plane (shingle close-ups look alike by nature).
  const comparable = existing.filter(
    (p) =>
      p.qualityStatus !== "rejected" &&
      p.id !== target.retakeOf?.photoId &&
      !(p.slotId === target.slotId && (p.planeId ?? null) !== target.planeId),
  );
  const flags = [...qualityFlags(analysis, comparable), ...content.flags];
  const blurScore = analysis?.sharpness ?? null;
  // "blurry" here means "needs the surveyor's decision" (any quality flag).
  const blurry = flags.length > 0;
  const photo: CapturedPhoto = {
    id,
    surveyId: target.surveyId,
    relPath,
    annotatedRelPath: null,
    mimeType: "image/jpeg",
    stepId: found.step.id as SurveyStepId,
    sectionId: found.section.id,
    slotId: target.slotId,
    planeId: target.planeId,
    required: found.slot.required,
    captureOrder: nextCaptureOrder(existing),
    capturedAt,
    gps: where.gps,
    heading: where.heading,
    notes: "",
    retakeReason: target.retakeOf?.reason ?? null,
    // Blurry photos wait for the surveyor's decision (retake or keep with a reason).
    qualityStatus: blurry ? "pending_review" : "accepted",
    blurScore,
    qualityFlags: flags,
    ahash: analysis?.ahash ?? null,
    detectedText: content.text || null,
    labels: content.labels,
    contentCheck: content.checked ? "checked" : content.unavailable === "failed" ? "failed" : "unavailable",
    uploadState: "local",
    serverPhotoId: null,
  };
  await insertPhoto(photo);
  return { photo, blurry };
}

export async function takePhoto(target: CaptureTarget, existing: CapturedPhoto[]): Promise<CaptureResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { kind: "denied" };
  // Ask for location once, early; capture works without it.
  void Location.requestForegroundPermissionsAsync().catch(() => undefined);

  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(target));
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
      exif: true,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return { kind: "cancelled" };
    const asset = result.assets[0];
    // Location and compass are read when the camera returns (the phone is
    // still pointing at the subject); the camera's own EXIF GPS wins if present.
    const exif = readExif(asset.exif as Exif);
    const live = await currentFix();
    const filed = await fileAsset(asset, target, existing, { gps: exif.gps ?? live.gps, heading: live.heading });
    return { kind: "captured", ...filed };
  } finally {
    await AsyncStorage.removeItem(PENDING_KEY);
  }
}

/** Pick existing images from the library into a slot (e.g. taken with another camera). */
export async function pickFromLibrary(
  target: CaptureTarget,
  existing: CapturedPhoto[],
  limit: number,
): Promise<{ photo: CapturedPhoto; blurry: boolean }[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    exif: true,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  });
  if (result.canceled || !result.assets?.length) return [];
  const out: { photo: CapturedPhoto; blurry: boolean }[] = [];
  let all = existing;
  for (const asset of result.assets.slice(0, limit)) {
    // Library photos keep their own time and place (heading isn't known).
    const exif = readExif(asset.exif as Exif);
    const filed = await fileAsset(asset, target, all, { gps: exif.gps, heading: null }, exif.takenAt);
    out.push(filed);
    all = [...all, filed.photo];
  }
  return out;
}

/**
 * Recover a photo taken just before Android killed the app.
 * Returns the filed photo (or null if there was nothing to recover).
 */
export async function recoverPendingCapture(
  surveyId: string,
  existing: CapturedPhoto[],
): Promise<{ photo: CapturedPhoto; blurry: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const target = JSON.parse(raw) as CaptureTarget;
    if (target.surveyId !== surveyId) return null;
    const pending = await ImagePicker.getPendingResultAsync();
    await AsyncStorage.removeItem(PENDING_KEY);
    const res = Array.isArray(pending) ? pending[0] : pending;
    if (!res || !("assets" in res) || res.canceled || !res.assets?.length) return null;
    return await fileAsset(res.assets[0], target, existing);
  } catch {
    return null;
  }
}

/** Save a marked-up copy (from react-native-view-shot) next to the original. */
export async function storeMarkup(photo: CapturedPhoto, tmpUri: string): Promise<string> {
  await ensureDir();
  const rel = `${PHOTO_DIR}${photo.id}-markup-${Date.now()}.jpg`;
  await FileSystem.moveAsync({ from: tmpUri, to: absPath(rel) });
  if (photo.annotatedRelPath) {
    await FileSystem.deleteAsync(absPath(photo.annotatedRelPath), { idempotent: true }).catch(() => undefined);
  }
  return rel;
}

export async function discardMarkupFile(relPath: string): Promise<void> {
  await FileSystem.deleteAsync(absPath(relPath), { idempotent: true }).catch(() => undefined);
}
