// ============================================================
// Survey document + captured photo model.
//
// A SurveyDoc is everything the surveyor entered. It is saved to SQLite
// on every change, so nothing is lost if the app is killed.
// A CapturedPhoto carries the Golden Block from the moment of capture.
// ============================================================

import type { PhotoQualityStatus, SurveyStepId } from "../types/pipeline";
import type { AnswerValue, InstallType } from "./blueprint";

export interface RoofPlane {
  /** Stable id, never reused within a survey ("A", "B", …). */
  id: string;
  answers: Record<string, AnswerValue>;
}

/** A required slot or field the surveyor chose to skip, and why. */
export interface Override {
  /** Item key: slot key, or "field:<fieldId>" / "field:<planeId>:<fieldId>". */
  key: string;
  reason: string;
  at: string;
}

export interface ProjectLink {
  solarproProjectId: string | null;
  solarproClientId: string | null;
  projectName: string;
  clientName: string | null;
  /** Set when the survey came from a SolarPro handoff link. */
  handoff?: {
    solarproUserId: string | null;
    solarproEmail: string | null;
  } | null;
}

export interface SurveyDoc {
  version: 2;
  installType: InstallType;
  project: ProjectLink;
  inspectorName: string;
  /** Survey-level answers keyed by field id. */
  answers: Record<string, AnswerValue>;
  planes: RoofPlane[];
  /** Count of plane ids handed out so far (ids are never reused). */
  planeSeq?: number;
  overrides: Override[];
  notes: string;
  /** First time the survey was opened on site (Arrival Time). */
  arrivedAt: string;
  gps: { lat: number; lng: number; accuracy: number | null } | null;
  /** Untouched data from a handoff for fields the blueprint doesn't show. */
  extra: Record<string, unknown>;
}

export type UploadState = "local" | "uploaded";

export type ContentCheck = "checked" | "unavailable" | "failed";

export interface CapturedPhoto {
  id: string;
  surveyId: string;
  /** Path relative to the app's document directory. */
  relPath: string;
  /** Marked-up copy, relative path; the original is never changed. */
  annotatedRelPath: string | null;
  mimeType: string;
  // Golden Block
  stepId: SurveyStepId;
  sectionId: string;
  slotId: string;
  planeId: string | null;
  required: boolean;
  captureOrder: number;
  capturedAt: string;
  gps: { lat: number; lng: number; alt: number | null } | null;
  heading: number | null;
  notes: string;
  retakeReason: string | null;
  qualityStatus: PhotoQualityStatus;
  /** Sharpness score (variance of Laplacian); higher is sharper. null when not measured. */
  blurScore: number | null;
  /** Problems the on-device check found: blurry, dark, bright, duplicate. */
  qualityFlags?: string[];
  /** Perceptual hash used to spot the same shot taken twice. */
  ahash?: string | null;
  /** Text read from the photo on the phone (meter numbers, labels). */
  detectedText?: string | null;
  /** On-device image labels with confidence. */
  labels?: { text: string; confidence: number }[] | null;
  /**
   * On-device content check: "checked" ran; "unavailable" this phone has no
   * ML Kit; "failed" it errored on this photo. null: older photo.
   */
  contentCheck?: ContentCheck | null;
  /** Editable markup vectors (MarkupEditor marks); the rendered copy is annotatedRelPath. */
  markup?: unknown[] | null;
  uploadState: UploadState;
  serverPhotoId: string | null;
}

/** Key for a slot within a survey: plane slots are scoped by plane id. */
export function slotKey(slotId: string, planeId: string | null): string {
  return planeId ? `${planeId}:${slotId}` : slotId;
}

export function fieldKey(fieldId: string, planeId: string | null): string {
  return planeId ? `field:${planeId}:${fieldId}` : `field:${fieldId}`;
}

/**
 * Next plane id. Ids are never reused within a survey (a removed "B" is not
 * handed out again), so photos can never attach to the wrong plane.
 */
export function nextPlaneId(doc: Pick<SurveyDoc, "planes" | "planeSeq">): string {
  const used = new Set(doc.planes.map((p) => p.id));
  let n = Math.max(doc.planeSeq ?? 0, doc.planes.length);
  for (;;) {
    const id = n < 26 ? String.fromCharCode(65 + n) : `P${n + 1}`;
    n++;
    if (!used.has(id)) return id;
  }
}

/** Plane-sequence value after handing out `id`. */
export function planeSeqAfter(id: string): number {
  if (/^[A-Z]$/.test(id)) return id.charCodeAt(0) - 64;
  const m = /^P(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

export function newSurveyDoc(input: {
  installType: InstallType;
  project: ProjectLink;
  inspectorName: string;
  siteAddress?: string;
  now?: string;
}): SurveyDoc {
  const now = input.now ?? new Date().toISOString();
  const roofish = input.installType === "roof_mount" || input.installType === "commercial_3phase";
  return {
    version: 2,
    installType: input.installType,
    project: input.project,
    inspectorName: input.inspectorName,
    answers: input.siteAddress ? { site_address: input.siteAddress } : {},
    planes: roofish ? [{ id: "A", answers: {} }] : [],
    planeSeq: roofish ? 1 : 0,
    overrides: [],
    notes: "",
    arrivedAt: now,
    gps: null,
    extra: {},
  };
}
