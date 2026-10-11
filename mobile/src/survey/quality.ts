// ============================================================
// On-device blur check. Runs offline right after the shutter.
//
// Score = variance of the Laplacian of a grayscale thumbnail: sharp
// edges give a high variance, blur flattens it. The thumbnail keeps the
// cost small (~170k pixels) and makes scores comparable across cameras.
// ============================================================

import { decode as decodeJpeg } from "jpeg-js";
import { findSlot } from "./blueprint";
import { TEXT_SLOTS } from "./content";

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

// ── Exposure and duplicate checks ───────────────────────────────

/** Mean luma below this is too dark to read labels. */
export const DARK_MEAN = 40;
/** Mean luma above this, with little detail, is washed out (glare, sky). */
export const BRIGHT_MEAN = 225;

export type QualityFlag = "blurry" | "dark" | "bright" | "duplicate";

export interface ImageAnalysis {
  sharpness: number;
  brightness: number;
  /** 64-bit average hash (16 hex chars) of an 8×8 grayscale thumbnail. */
  ahash: string;
}

export function meanLuma(gray: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  return gray.length ? sum / gray.length : 0;
}

/** Average hash: shrink to 8×8 by block means, threshold on the mean. */
export function averageHash(gray: Uint8Array, width: number, height: number): string {
  const cells: number[] = [];
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      const x0 = Math.floor((bx * width) / 8);
      const x1 = Math.max(x0 + 1, Math.floor(((bx + 1) * width) / 8));
      const y0 = Math.floor((by * height) / 8);
      const y1 = Math.max(y0 + 1, Math.floor(((by + 1) * height) / 8));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += gray[y * width + x];
          n++;
        }
      }
      cells.push(sum / n);
    }
  }
  const mean = cells.reduce((a, b) => a + b, 0) / 64;
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let j = 0; j < 4; j++) nib = (nib << 1) | (cells[i + j] > mean ? 1 : 0);
    hex += nib.toString(16);
  }
  return hex;
}

export function hammingHex(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d + Math.abs(a.length - b.length) * 4;
}

/** Two photos this close (of 64 bits) are the same shot taken twice. */
export const DUPLICATE_DISTANCE = 3;

export function analyzeJpegBase64(b64: string): ImageAnalysis {
  const img = decodeJpeg(base64ToBytes(b64), { useTArray: true, formatAsRGBA: true });
  const gray = toGray(img.data, img.width, img.height);
  return {
    sharpness: laplacianVariance(gray, img.width, img.height),
    brightness: meanLuma(gray),
    ahash: averageHash(gray, img.width, img.height),
  };
}

export function qualityFlags(
  a: ImageAnalysis | null,
  others: { ahash?: string | null }[],
): QualityFlag[] {
  if (!a) return [];
  const flags: QualityFlag[] = [];
  if (a.sharpness < BLUR_THRESHOLD) flags.push("blurry");
  if (a.brightness < DARK_MEAN) flags.push("dark");
  else if (a.brightness > BRIGHT_MEAN && a.sharpness < BLUR_THRESHOLD * 4) flags.push("bright");
  if (others.some((o) => o.ahash && hammingHex(o.ahash, a.ahash) <= DUPLICATE_DISTANCE)) flags.push("duplicate");
  return flags;
}

/** Short names for badges and screen readers. */
export const FLAG_LABEL: Record<string, string> = {
  blurry: "blurry",
  dark: "too dark",
  bright: "washed out",
  duplicate: "duplicate",
  no_text: "no readable text",
  off_subject: "not a site photo",
  wrong_subject: "wrong subject",
};

export function flagLabels(flags: string[]): string {
  return flags.map((f) => FLAG_LABEL[f] ?? f).join(", ");
}

export function flagMessage(flags: string[], slotId?: string): string {
  const need = slotId ? TEXT_SLOTS[slotId] : undefined;
  const slotLabel = slotId ? findSlot(slotId)?.slot.label : undefined;
  const parts: Record<string, string> = {
    blurry: "looks blurry",
    dark: "is too dark",
    bright: "is washed out",
    duplicate: "looks the same as another photo in this survey",
    no_text: `has no readable ${need ? need.what : "text"}`,
    off_subject: "doesn't look like a site photo",
    wrong_subject: slotLabel ? `doesn't look like a “${slotLabel}” shot` : "doesn't seem to show what this slot needs",
  };
  const said = flags.map((f) => parts[f]).filter(Boolean);
  if (!said.length) return "";
  return `This photo ${said.join(" and ")}.`;
}
