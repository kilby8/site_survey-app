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

// Label names below are exactly as the ML Kit base image-labeling model
// emits them (https://developers.google.com/ml-kit/vision/image-labeling/label-map).
// Words outside that map (e.g. "House", "Window", "Grass") can never match.

/** Labels that mean "this is not a site photo". */
export const OFF_SUBJECT = new Set([
  "Selfie", "Smile", "Laugh", "Beard", "Moustache", "Lipstick", "Eyelash",
  "Food", "Cuisine", "Fast food", "Meal", "Lunch", "Supper", "Cake", "Cookie", "Pizza", "Bread", "Fruit", "Juice",
  "Coffee", "Cappuccino", "Wine", "Alcohol", "Cola", "Cup", "Tableware", "Cutlery",
  "Cat", "Dog", "Pet", "Toy", "Stuffed toy", "Plush",
  "Couch", "Pillow", "Cushion", "Bedroom", "Bunk bed",
]);
/** Screens: off-subject except on meter/electrical slots (digital meters, inverter displays). */
export const SCREEN_LABELS = new Set(["Screenshot", "Web page", "Television", "Computer", "Mobile phone"]);
/** Slot prefixes where a screen is a legitimate subject (digital meters, inverter displays, a pitch app). */
const DISPLAY_OK_STEPS = ["utility_", "elec_", "roof_pitch", "fin_production", "fin_ct_data", "fin_commission", "fin_compliance", "fin_inclinometer"];

const BUILT = ["Building", "Roof", "Wall", "Brick", "Tile", "Metal", "Infrastructure", "Construction"];
const LAND = ["Field", "Soil", "Prairie", "Plant", "Flora", "Forest", "Garden", "Farm", "Ranch", "Rock", "Sand", "Road"];

/**
 * What each kind of slot should show. A labelled photo with none of these
 * is flagged "doesn't look like <slot>"; a confident one also outweighs a
 * weaker off-subject label (a dog in front of the house).
 */
export const EXPECTED: { prefix: string; labels: string[] }[] = [
  { prefix: "roof_", labels: [...BUILT, "Asphalt", "Pattern", "Rock", "Skyline"] },
  { prefix: "walk_", labels: [...BUILT, "Garden", "Plant", "Flora", "Forest", "Branch", "Twig", "Field", "Skyline", "Barn", "Farm", "Ranch", "Stairs", "Handrail"] },
  { prefix: "arrival_", labels: [...BUILT, "Road", "Asphalt", "Stairs", "Handrail", "Garden", "Plant", "Flora", "Car", "Vehicle", "Field", "Farm", "Barn", "Ranch"] },
  { prefix: "utility_", labels: [...BUILT, "Odometer", "Clock", "Product", "Garden", "Plant", "Soil", "Field", "Road"] },
  { prefix: "elec_", labels: ["Wall", "Metal", "Product", "Infrastructure", "Construction", "Cabinetry", "Shelf", "Drawer", "Room", "Building", "Clock", "Paper", "Tile", "Brick"] },
  { prefix: "ground_", labels: [...LAND, "Construction", "Infrastructure"] },
  { prefix: "fence_", labels: [...LAND, "Metal", "Construction", "Infrastructure"] },
];

/**
 * Slots where "is the subject there?" isn't asked: text slots (the text
 * check is the real test) and close-ups the general model labels poorly.
 */
const NO_SUBJECT_CHECK = new Set([...Object.keys(TEXT_SLOTS), "roof_pitch", "roof_attic", "roof_structure", "elec_grounding"]);

export const OFF_SUBJECT_CONFIDENCE = 0.75;
export const EXPECTED_CONFIDENCE = 0.5;

export type ContentFlag = "no_text" | "off_subject" | "wrong_subject";

export interface ContentResult {
  flags: ContentFlag[];
  /** Text read from the photo (trimmed), for the designer and the meter-number hint. */
  text: string;
  labels: { text: string; confidence: number }[];
  /** False when the phone couldn't run the check (shown on the photo, never silent). */
  checked: boolean;
  /** Why it didn't run: the phone lacks ML Kit, or it failed on this photo. */
  unavailable?: "no_mlkit" | "failed";
}

export function contentFlags(
  slotId: string,
  text: string,
  labels: { text: string; confidence: number }[],
): ContentFlag[] {
  const flags: ContentFlag[] = [];
  const need = TEXT_SLOTS[slotId];
  if (need) {
    const alnum = text.replace(/[^A-Za-z0-9]/g, "");
    const ok = need.digits ? /\d/.test(alnum) && alnum.length >= 2 : alnum.length >= 6;
    if (!ok) flags.push("no_text");
  }
  const expected = EXPECTED.find((e) => slotId.startsWith(e.prefix))?.labels ?? [];
  const bestExpected = Math.max(0, ...labels.filter((l) => expected.includes(l.text)).map((l) => l.confidence));
  const displayOk = DISPLAY_OK_STEPS.some((p) => slotId.startsWith(p));
  const bestOff = Math.max(
    0,
    ...labels.filter((l) => OFF_SUBJECT.has(l.text) || (!displayOk && SCREEN_LABELS.has(l.text))).map((l) => l.confidence),
  );
  if (bestOff >= OFF_SUBJECT_CONFIDENCE && bestOff > bestExpected) {
    flags.push("off_subject");
  } else if (labels.some((l) => l.confidence >= EXPECTED_CONFIDENCE) && expected.length > 0 && !NO_SUBJECT_CHECK.has(slotId) && bestExpected < EXPECTED_CONFIDENCE) {
    // Positive check: the labeller saw something, but none of it is what this slot needs.
    flags.push("wrong_subject");
  }
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
  let labelsRan = false;
  // Both models run side by side on the same (small) copy.
  await Promise.all([
    (async () => {
      if (!ocr) return;
      try {
        text = ((await ocr.recognize(uri))?.text ?? "").trim();
        ocrRan = true;
      } catch {
        text = "";
      }
    })(),
    (async () => {
      if (!labeler) return;
      try {
        labels = ((await labeler.label(uri)) ?? []).slice(0, 10).map((l) => ({ text: l.text, confidence: l.confidence }));
        labelsRan = true;
      } catch {
        labels = [];
      }
    })(),
  ]);
  // Don't flag what we couldn't check: no OCR → no text verdict.
  const flags = contentFlags(slotId, ocrRan ? text : "x1x1x1", labelsRan ? labels : []);
  const checked = ocrRan && labelsRan;
  return {
    flags,
    text: text.slice(0, 400),
    labels,
    checked,
    unavailable: checked ? undefined : !ocr || !labeler ? "no_mlkit" : "failed",
  };
}
