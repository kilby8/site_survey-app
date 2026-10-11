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
  overrides: Override[];
  notes: string;
  /** First time the survey was opened on site (Arrival Time). */
  arrivedAt: string;
  gps: { lat: number; lng: number; accuracy: number | null } | null;
  /** Untouched data from a handoff for fields the blueprint doesn't show. */
  extra: Record<string, unknown>;
}

export type UploadState = "local" | "uploaded";

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

export function nextPlaneId(planes: RoofPlane[]): string {
  const used = new Set(planes.map((p) => p.id));
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i);
    if (!used.has(id)) return id;
  }
  return `P${planes.length + 1}`;
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
    overrides: [],
    notes: "",
    arrivedAt: now,
    gps: null,
    extra: {},
  };
}
