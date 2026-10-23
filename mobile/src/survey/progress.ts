// ============================================================
// Progress and readiness — pure functions over (doc, photos).
// Used for the step rings, section counts, Review and the submit gate.
// ============================================================

import type { SurveyStepId } from "../types/pipeline";
import {
  stepsFor,
  type AnswerValue,
  type Condition,
  type FieldDef,
  type InstallType,
  type SectionDef,
  type SlotDef,
  type StepDef,
} from "./blueprint";
import { fieldKey, slotKey, type CapturedPhoto, type SurveyDoc } from "./model";

export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

/** A number outside the field's min/max doesn't count as answered. */
export function isValidAnswer(field: FieldDef, value: AnswerValue | undefined): boolean {
  if (!isAnswered(value)) return false;
  if (typeof value === "number") {
    if (field.min !== undefined && value < field.min) return false;
    if (field.max !== undefined && value > field.max) return false;
  }
  return true;
}

export function conditionHolds(
  cond: Condition | undefined,
  answers: Record<string, AnswerValue>,
  installType: InstallType,
): boolean {
  if (!cond) return true;
  if (cond.installTypes && !cond.installTypes.includes(installType)) return false;
  if (!cond.field) return true;
  const value = answers[cond.field];
  if (cond.equals !== undefined && value !== cond.equals) return false;
  if (cond.oneOf && (typeof value !== "string" || !cond.oneOf.includes(value))) return false;
  if (cond.notEquals !== undefined && (value === cond.notEquals || !isAnswered(value))) return false;
  if (cond.includesAny) {
    if (!Array.isArray(value) || !value.some((v) => cond.includesAny!.includes(v))) return false;
  }
  if (cond.hasOtherThan) {
    if (!Array.isArray(value) || !value.some((v) => !cond.hasOtherThan!.includes(v))) return false;
  }
  return true;
}

/** A section as shown on screen: plane sections appear once per plane. */
export interface SectionInstance {
  step: StepDef;
  section: SectionDef;
  planeId: string | null;
  /** Answers in this section's scope (the plane's answers for plane sections). */
  answers: Record<string, AnswerValue>;
  fields: FieldDef[];
  slots: SlotDef[];
}

export function sectionInstances(doc: SurveyDoc, step: StepDef): SectionInstance[] {
  const out: SectionInstance[] = [];
  for (const section of step.sections) {
    if (!conditionHolds(section.showIf, doc.answers, doc.installType)) continue;
    const scopes =
      section.repeat === "plane"
        ? doc.planes.map((p) => ({ planeId: p.id as string | null, answers: p.answers }))
        : [{ planeId: null as string | null, answers: doc.answers }];
    for (const scope of scopes) {
      out.push({
        step,
        section,
        planeId: scope.planeId,
        answers: scope.answers,
        fields: section.fields.filter((f) => conditionHolds(f.showIf, scope.answers, doc.installType)),
        slots: section.slots.filter((s) => conditionHolds(s.showIf, scope.answers, doc.installType)),
      });
    }
  }
  return out;
}

export function photosForSlot(
  photos: CapturedPhoto[],
  slotId: string,
  planeId: string | null,
): CapturedPhoto[] {
  return photos
    .filter((p) => p.slotId === slotId && (p.planeId ?? null) === planeId)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export interface RequiredItem {
  key: string;
  kind: "field" | "slot";
  stepId: SurveyStepId;
  sectionId: string;
  planeId: string | null;
  label: string;
  done: boolean;
  overridden: boolean;
}

export interface SectionProgress {
  instance: SectionInstance;
  total: number;
  done: number;
}

export interface StepProgress {
  step: StepDef;
  sections: SectionProgress[];
  items: RequiredItem[];
  total: number;
  /** Done or overridden. */
  done: number;
  /** Photos in this step flagged by the blur check and kept anyway. */
  flagged: CapturedPhoto[];
}

function itemLabel(instance: SectionInstance, label: string): string {
  return instance.planeId ? `Plane ${instance.planeId} · ${label}` : label;
}

export function stepProgress(
  doc: SurveyDoc,
  photos: CapturedPhoto[],
  stepId: SurveyStepId,
): StepProgress {
  const step = stepsFor(doc).find((s) => s.id === stepId)!;
  const overridden = new Set(doc.overrides.map((o) => o.key));
  const items: RequiredItem[] = [];
  const sections: SectionProgress[] = [];

  for (const instance of sectionInstances(doc, step)) {
    const before = items.length;
    for (const field of instance.fields) {
      if (!field.required) continue;
      const key = fieldKey(field.id, instance.planeId);
      items.push({
        key,
        kind: "field",
        stepId,
        sectionId: instance.section.id,
        planeId: instance.planeId,
        label: itemLabel(instance, field.label),
        done: isValidAnswer(field, instance.answers[field.id]),
        overridden: overridden.has(key),
      });
    }
    for (const slot of instance.slots) {
      if (!slot.required) continue;
      const key = slotKey(slot.id, instance.planeId);
      const good = photosForSlot(photos, slot.id, instance.planeId).filter(
        (p) => p.qualityStatus !== "rejected",
      );
      items.push({
        key,
        kind: "slot",
        stepId,
        sectionId: instance.section.id,
        planeId: instance.planeId,
        label: itemLabel(instance, slot.label),
        done: good.length > 0,
        overridden: overridden.has(key),
      });
    }
    const mine = items.slice(before);
    sections.push({
      instance,
      total: mine.length,
      done: mine.filter((i) => i.done || i.overridden).length,
    });
  }

  const stepPhotos = photos.filter((p) => p.stepId === stepId);
  return {
    step,
    sections,
    items,
    total: items.length,
    done: items.filter((i) => i.done || i.overridden).length,
    flagged: stepPhotos.filter((p) => p.qualityStatus === "pending_review"),
  };
}

export interface SurveyReadiness {
  steps: StepProgress[];
  total: number;
  done: number;
  /** Required items neither done nor overridden. Submit is blocked while any exist. */
  missing: RequiredItem[];
  /** Blurry photos kept without a written reason. Submit is blocked while any exist. */
  unexplainedBlurry: CapturedPhoto[];
  ready: boolean;
}

export function surveyReadiness(doc: SurveyDoc, photos: CapturedPhoto[]): SurveyReadiness {
  const steps = stepsFor(doc).map((s) => stepProgress(doc, photos, s.id));
  const items = steps.flatMap((s) => s.items);
  const missing = items.filter((i) => !i.done && !i.overridden);
  const unexplainedBlurry = photos.filter(
    (p) => p.qualityStatus === "pending_review" && !(p.notes ?? "").trim(),
  );
  return {
    steps,
    total: items.length,
    done: items.filter((i) => i.done || i.overridden).length,
    missing,
    unexplainedBlurry,
    ready: missing.length === 0 && unexplainedBlurry.length === 0,
  };
}

/** Next capture order for a slot (1-based, increases with each capture incl. retakes). */
export function nextCaptureOrder(photos: CapturedPhoto[]): number {
  return photos.reduce((max, p) => Math.max(max, p.captureOrder), 0) + 1;
}

export interface ShotTarget {
  slot: SlotDef;
  planeId: string | null;
  sectionTitle: string;
}

/**
 * Photo slots in a step in screen order, with whether each is still needed.
 * Drives the guided camera: it walks the empty required slots in order.
 */
export function stepShots(doc: SurveyDoc, photos: CapturedPhoto[], stepId: SurveyStepId): Array<ShotTarget & { filled: number; needed: boolean }> {
  const step = stepsFor(doc).find((s) => s.id === stepId)!;
  const overridden = new Set(doc.overrides.map((o) => o.key));
  const out: Array<ShotTarget & { filled: number; needed: boolean }> = [];
  for (const inst of sectionInstances(doc, step)) {
    for (const slot of inst.slots) {
      const filled = photosForSlot(photos, slot.id, inst.planeId).filter((p) => p.qualityStatus !== "rejected").length;
      out.push({
        slot,
        planeId: inst.planeId,
        sectionTitle: inst.planeId ? `Roof plane ${inst.planeId}` : inst.section.title,
        filled,
        needed: slot.required && filled === 0 && !overridden.has(slotKey(slot.id, inst.planeId)),
      });
    }
  }
  return out;
}

/** The next slot still needing a photo after `current` (wrapping), or null when the step is covered. */
export function nextNeededShot(
  doc: SurveyDoc,
  photos: CapturedPhoto[],
  stepId: SurveyStepId,
  current: { slotId: string; planeId: string | null },
): ShotTarget | null {
  const shots = stepShots(doc, photos, stepId);
  const i = shots.findIndex((x) => x.slot.id === current.slotId && x.planeId === current.planeId);
  const ordered = [...shots.slice(i + 1), ...shots.slice(0, Math.max(i, 0))];
  return ordered.find((x) => x.needed) ?? null;
}
