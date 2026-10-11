// ============================================================
// On-device blur check. Runs offline right after the shutter.
//
// Score = variance of the Laplacian of a grayscale thumbnail: sharp
// edges give a high variance, blur flattens it. The thumbnail keeps the
// cost small (~170k pixels) and makes scores comparable across cameras.
// ============================================================

import { decode as decodeJpeg } from "jpeg-js";

export const BLUR_SAMPLE_WIDTH = 480;
/** Below this the photo is flagged as blurry. Calibrated on 480 px thumbnails of
 * reference photos: sharp 117–1675, mild softness 13–278, clearly blurry < 20. */
export const BLUR_THRESHOLD = 25;

/** Variance of the 4-neighbour Laplacian over a grayscale image (0–255). */
export function laplacianVariance(gray: Uint8Array | number[], width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const lap = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** RGBA → luma (Rec. 601). */
export function toGray(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)];
    out[o++] = (a << 2) | (b >> 4);
    if (o < len) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < len) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

/** Sharpness score of a JPEG given as base64. */
export function sharpnessFromJpegBase64(b64: string): number {
  const img = decodeJpeg(base64ToBytes(b64), { useTArray: true, formatAsRGBA: true });
  return laplacianVariance(toGray(img.data, img.width, img.height), img.width, img.height);
}

export function isBlurry(score: number | null): boolean {
  return score !== null && score < BLUR_THRESHOLD;
}
