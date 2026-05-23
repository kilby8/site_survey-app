/**
 * services/photoService.ts
 *
 * Handles camera capture and photo-library selection using expo-image-picker.
 * Copies captured images into the app's permanent document directory so they
 * persist even if the camera roll is cleared.
 * Returns the local file path to be stored in SQLite.
 */
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem  from 'expo-file-system/legacy';

const PHOTOS_DIR = `${FileSystem.documentDirectory}survey-photos/`;

const VIDEOS_DIR = `${FileSystem.documentDirectory}survey-videos/`;

function makeLocalId(): string {
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ----------------------------------------------------------------
// Ensure the photo storage directory exists
// ----------------------------------------------------------------
async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

async function ensureVideoDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(VIDEOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VIDEOS_DIR, { intermediates: true });
  }
}

export interface CapturedPhoto {
  uri:      string;  // permanent local file path
  mimeType: string;
  width:    number;
  height:   number;
}

export interface CapturedVideo {
  uri: string;
  mimeType: string;
  width: number;
  height: number;
  durationMs: number;
}

// ----------------------------------------------------------------
// Camera capture
// ----------------------------------------------------------------
export async function captureFromCamera(): Promise<CapturedPhoto | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Camera permission denied. Please enable it in Settings.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  return _copyPhotoToDocuments(result.assets[0]);
}

// ----------------------------------------------------------------
// Photo library picker
// ----------------------------------------------------------------
export async function pickFromLibrary(): Promise<CapturedPhoto | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Photo library permission denied. Please enable it in Settings.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  return _copyPhotoToDocuments(result.assets[0]);
}

export async function captureVideoFromCamera(): Promise<CapturedVideo | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Camera permission denied. Please enable it in Settings.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  return _copyVideoToDocuments(result.assets[0]);
}

export async function pickVideoFromLibrary(): Promise<CapturedVideo | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission denied. Please enable it in Settings.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
    quality: 0.85,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  return _copyVideoToDocuments(result.assets[0]);
}

// ----------------------------------------------------------------
// Camera capture (multi-shot loop)
// ----------------------------------------------------------------
export async function captureMultipleFromCamera(
  limit = 10,
): Promise<CapturedPhoto[]> {
  const normalizedLimit = Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : 10;

  const captured: CapturedPhoto[] = [];
  while (captured.length < normalizedLimit) {
    const next = await captureFromCamera();
    // User cancelled camera flow.
    if (!next) break;
    captured.push(next);
  }

  return captured;
}

// ----------------------------------------------------------------
// Photo library picker (multi-select)
// ----------------------------------------------------------------
export async function pickMultipleFromLibrary(
  limit = 20,
): Promise<CapturedPhoto[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Photo library permission denied. Please enable it in Settings.');
  }

  const normalizedLimit = Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : 20;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: normalizedLimit,
    quality: 0.85,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return [];

  const photos = await Promise.all(result.assets.map((asset) => _copyPhotoToDocuments(asset)));
  return photos;
}

// ----------------------------------------------------------------
// Copy a picked/captured asset into the app's documents directory
// ----------------------------------------------------------------
async function _copyPhotoToDocuments(
  asset: ImagePicker.ImagePickerAsset
): Promise<CapturedPhoto> {
  await ensureDir();

  const ext      = (asset.mimeType ?? 'image/jpeg') === 'image/png' ? '.png' : '.jpg';
  const filename = `${makeLocalId()}${ext}`;
  const destPath = `${PHOTOS_DIR}${filename}`;

  await FileSystem.copyAsync({ from: asset.uri, to: destPath });

  return {
    uri:      destPath,
    mimeType: asset.mimeType ?? 'image/jpeg',
    width:    asset.width    ?? 0,
    height:   asset.height   ?? 0,
  };
}

async function _copyVideoToDocuments(
  asset: ImagePicker.ImagePickerAsset
): Promise<CapturedVideo> {
  await ensureVideoDir();

  const mimeType = asset.mimeType ?? 'video/mp4';
  const ext = mimeType === 'video/quicktime' ? '.mov' : '.mp4';
  const filename = `${makeLocalId()}${ext}`;
  const destPath = `${VIDEOS_DIR}${filename}`;

  await FileSystem.copyAsync({ from: asset.uri, to: destPath });

  return {
    uri: destPath,
    mimeType,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    durationMs: asset.duration ?? 0,
  };
}

// ----------------------------------------------------------------
// Delete a stored photo file
// ----------------------------------------------------------------
export async function deletePhotoFile(filePath: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
  } catch { /* ignore delete errors */ }
}
