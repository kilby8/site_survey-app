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

/**
 * On-device image labels that mean "this is not a site photo".
 * Screens ("Monitor", "Screenshot") are only counted outside meter and
 * electrical slots, where a digital display is a legitimate subject.
 */
export const OFF_SUBJECT = new Set([
  "Selfie",
  "Smile",
  "Beard",
  "Food",
  "Cuisine",
  "Dessert",
  "Cake",
  "Drink",
  "Cup",
  "Tableware",
  "Cat",
  "Dog",
  "Pet",
  "Toy",
  "Bed",
  "Couch",
]);
const SCREEN_LABELS = new Set(["Screenshot", "Television", "Monitor"]);
const DISPLAY_OK_STEPS = ["utility_", "elec_"];

/**
 * What each kind of slot should show. Used two ways: a confident match
 * clears any off-subject suspicion; a confident off-subject label with
 * none of these present is flagged.
 */
export const EXPECTED: { prefix: string; labels: string[] }[] = [
  { prefix: "roof_", labels: ["Roof", "Building", "House", "Brick", "Wood", "Metal", "Ceiling", "Plank", "Lumber"] },
  { prefix: "walk_", labels: ["Building", "House", "Roof", "Tree", "Plant", "Sky", "Grass", "Lawn", "Window", "Porch"] },
  { prefix: "arrival_", labels: ["Building", "House", "Roof", "Road", "Asphalt", "Grass", "Door", "Window", "Fence"] },
  { prefix: "utility_", labels: ["Building", "Wall", "Brick", "Metal", "Pipe", "Pole", "Wire"] },
  { prefix: "elec_", labels: ["Metal", "Wall", "Electrical wiring", "Machine", "Pipe", "Plastic"] },
  { prefix: "ground_", labels: ["Grass", "Field", "Lawn", "Soil", "Plant", "Tree", "Sky"] },
  { prefix: "fence_", labels: ["Grass", "Field", "Fence", "Soil", "Plant", "Sky"] },
];

export const OFF_SUBJECT_CONFIDENCE = 0.75;
export const EXPECTED_CONFIDENCE = 0.6;

export interface ContentResult {
  flags: ("no_text" | "off_subject")[];
  /** Text read from the photo (trimmed), for the designer and the meter-number hint. */
  text: string;
  labels: { text: string; confidence: number }[];
  /** False when the phone couldn't run the check (shown on the photo, never silent). */
  checked: boolean;
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
  const expected = EXPECTED.find((e) => slotId.startsWith(e.prefix))?.labels ?? [];
  const looksRight = labels.some((l) => l.confidence >= EXPECTED_CONFIDENCE && expected.includes(l.text));
  const displayOk = DISPLAY_OK_STEPS.some((p) => slotId.startsWith(p));
  const offSubject = labels.some(
    (l) =>
      l.confidence >= OFF_SUBJECT_CONFIDENCE &&
      (OFF_SUBJECT.has(l.text) || (!displayOk && SCREEN_LABELS.has(l.text))),
  );
  if (offSubject && !looksRight) flags.push("off_subject");
  return flags;
}

/** Longest run of digits (with spaces/dashes) — e.g. a meter number. */
export function likelyNumber(text: string): string | null {
  // Whole-token digit runs on one line (so "CL200 240V" isn't read as a number).
  const runs = text.match(/(?<![A-Za-z0-9])\d[\d -]{3,}\d(?![A-Za-z0-9])/g) ?? [];
  const best = runs.map((r) => r.replace(/\s+/g, " ").trim()).sort((a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length)[0];
  const digits = best ? best.replace(/\D/g, "").length : 0;
  return best && digits >= 5 && digits <= 12 ? best : null;
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
let warned = false;

export async function checkContent(slotId: string, uri: string): Promise<ContentResult> {
  const { ocr, labeler } = nativeModules();
  if ((!ocr || !labeler) && !warned) {
    warned = true;
    console.warn("[content] ML Kit not available in this build; photo content check is off.");
  }
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
  return { flags, text: text.slice(0, 400), labels, checked: ocrRan && !!labeler };
}
