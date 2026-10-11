import { NativeModules } from "react-native";

// ============================================================
// On-device content check (offline, ML Kit): does the photo show what
// its slot needs? Label/number slots must contain readable text, and a
// photo that is clearly of something else (a selfie, food, a pet) is
// flagged. The text read is kept with the photo for the designer.
// ============================================================

/** Slots whose photo must show readable text, and what kind. */
export const TEXT_SLOTS: Record<string, { digits: boolean; what: string }> = {
  arrival_address: { digits: true, what: "the house number" },
  utility_meter_close: { digits: true, what: "the meter number" },
  elec_bus_label: { digits: true, what: "the rating label" },
  elec_main_breaker: { digits: true, what: "the breaker amp rating" },
  elec_directory: { digits: false, what: "the circuit directory" },
};

/** On-device image labels that mean "this is not a site photo". */
export const OFF_SUBJECT = new Set([
  "Selfie",
  "Smile",
  "Food",
  "Cuisine",
  "Dessert",
  "Cake",
  "Drink",
  "Cup",
  "Cat",
  "Dog",
  "Pet",
  "Toy",
  "Screenshot",
  "Television",
  "Monitor",
]);

export const OFF_SUBJECT_CONFIDENCE = 0.75;

export interface ContentResult {
  flags: ("no_text" | "off_subject")[];
  /** Text read from the photo (trimmed), for the designer and the meter-number hint. */
  text: string;
  labels: { text: string; confidence: number }[];
}

export function contentFlags(
  slotId: string,
  text: string,
  labels: { text: string; confidence: number }[],
): ContentResult["flags"] {
  const flags: ContentResult["flags"] = [];
  const need = TEXT_SLOTS[slotId];
  if (need) {
    const alnum = text.replace(/[^A-Za-z0-9]/g, "");
    const ok = need.digits ? /\d/.test(alnum) && alnum.length >= 2 : alnum.length >= 6;
    if (!ok) flags.push("no_text");
  }
  const confident = labels.filter((l) => l.confidence >= OFF_SUBJECT_CONFIDENCE);
  if (confident.length && confident.some((l) => OFF_SUBJECT.has(l.text))) flags.push("off_subject");
  return flags;
}

/** Longest run of digits (with spaces/dashes) — e.g. a meter number. */
export function likelyNumber(text: string): string | null {
  // Whole-token digit runs on one line (so "CL200 240V" isn't read as a number).
  const runs = text.match(/(?<![A-Za-z0-9])\d[\d -]{3,}\d(?![A-Za-z0-9])/g) ?? [];
  const best = runs.map((r) => r.replace(/\s+/g, " ").trim()).sort((a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length)[0];
  return best && best.replace(/\D/g, "").length >= 5 ? best : null;
}

type TextRecognizer = { recognize: (uri: string) => Promise<{ text: string }> };
type Labeler = { label: (uri: string) => Promise<{ text: string; confidence: number }[]> };

function nativeModules(): { ocr: TextRecognizer | null; labeler: Labeler | null } {
  // The ML Kit native modules exist in the app build only (not web preview or
  // tests). Their JS wrappers throw on use when unlinked, so check first.
  const nm = NativeModules as Record<string, unknown>;
  let ocr: TextRecognizer | null = null;
  let labeler: Labeler | null = null;
  try {
    if (nm.TextRecognition) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ocr = require("@react-native-ml-kit/text-recognition").default as TextRecognizer;
    }
  } catch {
    ocr = null;
  }
  try {
    if (nm.ImageLabeling) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      labeler = require("@react-native-ml-kit/image-labeling").default as Labeler;
    }
  } catch {
    labeler = null;
  }
  return { ocr, labeler };
}

/** Run the checks. Never throws: if ML Kit isn't available, returns no flags. */
export async function checkContent(slotId: string, uri: string): Promise<ContentResult> {
  const { ocr, labeler } = nativeModules();
  let text = "";
  let labels: { text: string; confidence: number }[] = [];
  let ocrRan = false;
  try {
    if (ocr) {
      text = ((await ocr.recognize(uri))?.text ?? "").trim();
      ocrRan = true;
    }
  } catch {
    text = "";
  }
  try {
    if (labeler) labels = ((await labeler.label(uri)) ?? []).slice(0, 8).map((l) => ({ text: l.text, confidence: l.confidence }));
  } catch {
    labels = [];
  }
  // Without OCR we can't judge text slots; don't flag what we couldn't check.
  const flags = contentFlags(slotId, ocrRan ? text : "x1x1x1", labels);
  return { flags, text: text.slice(0, 400), labels };
}
