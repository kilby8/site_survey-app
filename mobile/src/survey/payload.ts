// ============================================================
// SurveyDoc → server payload.
//
// Keeps every field the backend and SolarPro's v1 transformer already
// read (metadata.type, azimuth, roof_material, rafter_*, checklist[]),
// and adds metadata.survey_v2 with the full structured document.
// ============================================================

import { findSlot, INSTALL_TYPES, stepsFor, type AnswerValue } from "./blueprint";
import type { CapturedPhoto, SurveyDoc } from "./model";
import { sectionInstances, surveyReadiness } from "./progress";
import { slotKey } from "./model";

export interface ServerChecklistItem {
  label: string;
  status: "pass" | "fail" | "n/a" | "pending";
  notes: string;
}

export interface ServerSurveyPayload {
  id: string;
  project_name: string;
  category_id: string;
  category_name: string;
  inspector_name: string;
  site_name: string;
  site_address: string;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy: number | null;
  survey_date: string;
  notes: string;
  status: "submitted";
  device_id: string | null;
  solarpro_user_id: string | null;
  solarpro_project_id: string | null;
  solarpro_email: string | null;
  solarpro_org_id: string | null;
  metadata: Record<string, unknown>;
  checklist: ServerChecklistItem[];
  /** Photos the survey has now; server removes any of its v2 photos not listed. */
  client_photo_ids: string[];
}

const str = (v: AnswerValue | undefined): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const num = (v: AnswerValue | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const bool = (v: AnswerValue | undefined): boolean | null => (typeof v === "boolean" ? v : null);

/** Every roof plane in a flat, importer-friendly shape. */
function planesSummary(doc: SurveyDoc): Record<string, unknown>[] {
  return doc.planes.map((p) => ({
    plane_id: p.id,
    pitch: str(p.answers.pitch),
    azimuth: num(p.answers.azimuth),
    material: str(p.answers.material),
    obstructions: Array.isArray(p.answers.obstructions) ? p.answers.obstructions : [],
    notes: str(p.answers.plane_notes),
  }));
}

/** Legacy category metadata, read by the backend report and SolarPro's transformer. */
export function legacyMetadata(doc: SurveyDoc): Record<string, unknown> {
  const a = doc.answers;
  const planeA = doc.planes[0]?.answers ?? {};
  switch (doc.installType) {
    case "roof_mount":
      return {
        type: "roof_mount",
        roof_material: str(planeA.material),
        rafter_size: str(a.rafter_size),
        rafter_spacing: str(a.rafter_spacing),
        roof_age_years: num(a.roof_age_years),
        azimuth: num(planeA.azimuth),
        roof_pitch: str(planeA.pitch),
        roof_planes: planesSummary(doc),
      };
    case "ground_mount":
      return {
        type: "ground_mount",
        soil_type: str(a.soil_type),
        slope_degrees: num(a.slope_degrees),
        trenching_path: str(a.trenching_path) ?? "",
        vegetation_clearing: bool(a.vegetation_clearing) ?? false,
        azimuth: num(a.array_azimuth),
      };
    case "solar_fencing":
      return {
        type: "solar_fencing",
        perimeter_length_ft: num(a.perimeter_length_ft),
        lower_shade_risk: bool(a.lower_shade_risk) ?? false,
        foundation_type: str(a.foundation_type),
        bifacial_surface: str(a.bifacial_surface),
        azimuth: num(a.fence_azimuth),
      };
    case "commercial_3phase": {
      const extra = doc.extra as Record<string, unknown>;
      return {
        ...extra,
        type: "commercial_3phase",
        parcel_number: str(a.parcel_number) ?? "",
        utility_having_jurisdiction: str(a.utility_having_jurisdiction) ?? "",
        municipality_having_jurisdiction: str(a.municipality_having_jurisdiction) ?? "",
        nec_code_year: num(Number(a.nec_code_year)),
        snow_load_lbs_sqft: num(a.snow_load_lbs_sqft),
        seismic_rating: str(a.seismic_rating),
        building_height_ft: num(a.building_height_ft),
        max_wind_speed_mph: num(a.max_wind_speed_mph),
        wind_exposure_category: str(a.wind_exposure),
        system_kw: num(a.system_kw),
        array_azimuth: num(planeA.azimuth),
        roof_material: str(planeA.material),
        roof_pitch: str(planeA.pitch),
        roof_planes: planesSummary(doc),
      };
    }
  }
}

function formatAnswer(v: AnswerValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  const s = String(v).trim();
  return s ? s : null;
}

/** One checklist row per step, so existing reports keep working. */
export function checklistFromDoc(doc: SurveyDoc, photos: CapturedPhoto[]): ServerChecklistItem[] {
  const readiness = surveyReadiness(doc, photos);
  return readiness.steps.map((sp) => {
    const lines: string[] = [];
    for (const inst of sectionInstances(doc, sp.step)) {
      for (const field of inst.fields) {
        const value = formatAnswer(inst.answers[field.id]);
        if (value === null) continue;
        const prefix = inst.planeId ? `Plane ${inst.planeId} ` : "";
        lines.push(`${prefix}${field.label}: ${value}${field.unit ? ` ${field.unit}` : ""}`);
      }
    }
    const overrides = sp.items.filter((i) => i.overridden && !i.done);
    for (const item of overrides) {
      const reason = doc.overrides.find((o) => o.key === item.key)?.reason ?? "";
      lines.push(`Skipped ${item.label}: ${reason}`);
    }
    const missing = sp.items.some((i) => !i.done && !i.overridden);
    return {
      label: `${sp.step.number}. ${sp.step.title}`,
      status: sp.total === 0 ? "n/a" : missing ? "fail" : "pass",
      notes: lines.join("\n"),
    };
  });
}

/** Photos that belong in the upload: in a slot that is still shown, and not rejected. */
export function photosToSend(doc: SurveyDoc, photos: CapturedPhoto[]): CapturedPhoto[] {
  const visible = new Set<string>();
  for (const step of stepsFor(doc)) {
    for (const inst of sectionInstances(doc, step)) {
      for (const slot of inst.slots) visible.add(slotKey(slot.id, inst.planeId));
    }
  }
  return photos.filter((p) => p.qualityStatus !== "rejected" && visible.has(slotKey(p.slotId, p.planeId)));
}

/** Server id for a photo's marked-up copy (changes when the markup changes). */
export function markupClientId(photo: CapturedPhoto): string {
  const file = photo.annotatedRelPath?.split("/").pop()?.replace(/\.jpg$/, "") ?? "markup";
  return `${photo.id}-${file.startsWith(photo.id) ? file.slice(photo.id.length + 1) : file}`;
}

/** Every server-side photo id this survey should have; the server drops the rest. */
export function clientPhotoIds(photos: CapturedPhoto[]): string[] {
  return photos.flatMap((p) => (p.annotatedRelPath ? [p.id, markupClientId(p)] : [p.id]));
}

export function photoLabel(photo: CapturedPhoto): string {
  const found = findSlot(photo.slotId);
  if (!found) return photo.slotId;
  const plane = photo.planeId ? `Plane ${photo.planeId} · ` : "";
  return `${found.step.short} · ${plane}${found.slot.label}`;
}

/** Golden Block, as sent with each photo upload. */
export function goldenBlock(photo: CapturedPhoto, doc: SurveyDoc): Record<string, unknown> {
  const found = findSlot(photo.slotId);
  return {
    projectId: doc.project.solarproProjectId,
    surveyId: photo.surveyId,
    stepId: photo.stepId,
    sectionId: photo.sectionId,
    photoSlotId: photo.slotId,
    planeId: photo.planeId,
    evidenceCategory: found?.step.evidence ?? null,
    isRequired: photo.required,
    captureOrder: photo.captureOrder,
    timestamp: photo.capturedAt,
    gps: photo.gps,
    heading: photo.heading,
    notes: photo.notes || null,
    retakeReason: photo.retakeReason,
    qualityStatus: photo.qualityStatus,
    blurScore: photo.blurScore,
    qualityFlags: photo.qualityFlags ?? [],
    detectedText: photo.detectedText ?? null,
    labels: photo.labels ?? [],
    contentCheck: photo.contentCheck ?? null,
    annotated: Boolean(photo.annotatedRelPath),
    solarProRequirementId: found?.slot.requirementId ?? null,
    solarProUsageMapping: found?.slot.usage ?? [],
  };
}

export function buildSurveyPayload(input: {
  id: string;
  doc: SurveyDoc;
  photos: CapturedPhoto[];
  deviceId: string | null;
  createdAt: string;
}): ServerSurveyPayload {
  const { doc } = input;
  const install = INSTALL_TYPES.find((t) => t.id === doc.installType)!;
  const address = str(doc.answers.site_address) ?? "";
  const projectName = doc.project.projectName.trim() || address || "Site survey";
  return {
    id: input.id,
    project_name: projectName,
    category_id: doc.installType,
    category_name: install.label,
    inspector_name: doc.inspectorName.trim() || "Unknown",
    site_name: projectName,
    site_address: address,
    latitude: doc.gps?.lat ?? null,
    longitude: doc.gps?.lng ?? null,
    gps_accuracy: doc.gps?.accuracy ?? null,
    survey_date: doc.arrivedAt,
    notes: doc.notes,
    status: "submitted",
    device_id: input.deviceId,
    solarpro_user_id: doc.project.handoff?.solarproUserId ?? null,
    solarpro_project_id: doc.project.solarproProjectId,
    solarpro_email: doc.project.handoff?.solarproEmail ?? null,
    solarpro_org_id: doc.project.solarproClientId,
    metadata: {
      ...legacyMetadata(doc),
      survey_v2: {
        version: 2,
        installType: doc.installType,
        arrivedAt: doc.arrivedAt,
        answers: doc.answers,
        planes: doc.planes,
        overrides: doc.overrides,
        steps: stepsFor(doc).map((s) => s.id),
      },
    },
    checklist: checklistFromDoc(doc, input.photos),
    client_photo_ids: clientPhotoIds(input.photos),
  };
}
