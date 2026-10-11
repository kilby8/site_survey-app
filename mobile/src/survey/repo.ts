// ============================================================
// SQLite persistence for v2 surveys.
//
// A survey row exists from the first tap (status 'draft', sync_status
// 'local'); the doc is rewritten on every change. Submitting flips it to
// status 'submitted', sync_status 'pending' for the sync engine.
// ============================================================

import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "../database/surveyDb";
import type { SurveyStepId } from "../types/pipeline";
import { INSTALL_TYPES } from "./blueprint";
import type { CapturedPhoto, SurveyDoc } from "./model";

export const PHOTO_DIR = "survey-photos-v2/";

export function newId(): string {
  return Crypto.randomUUID();
}

export function absPath(relPath: string): string {
  if (relPath.startsWith("file://") || relPath.startsWith("/")) return relPath;
  return `${FileSystem.documentDirectory ?? ""}${relPath}`;
}

interface SurveyRowV2 {
  id: string;
  doc: string | null;
  current_step: string | null;
  status: string;
  sync_status: string;
  sync_error: string | null;
  sync_attempts: number | null;
  next_retry_at: string | null;
  server_posted: number | null;
  owner_email: string | null;
  device_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PhotoRowV2 {
  id: string;
  survey_id: string;
  file_path: string;
  rel_path: string | null;
  annotated_rel_path: string | null;
  mime_type: string;
  step_id: string;
  section_id: string;
  slot_id: string;
  plane_id: string | null;
  required: number;
  capture_order: number;
  captured_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_alt: number | null;
  heading: number | null;
  notes: string | null;
  retake_reason: string | null;
  quality_status: string | null;
  blur_score: number | null;
  quality_flags: string | null;
  ahash: string | null;
  markup_json: string | null;
  upload_state: string | null;
  server_photo_id: string | null;
}

export interface StoredSurvey {
  id: string;
  doc: SurveyDoc;
  currentStep: SurveyStepId | "review";
  status: "draft" | "submitted";
  syncStatus: "local" | "pending" | "syncing" | "synced" | "error";
  syncError: string | null;
  syncAttempts: number;
  nextRetryAt: string | null;
  serverPosted: boolean;
  ownerEmail: string | null;
  deviceId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToSurvey(r: SurveyRowV2): StoredSurvey {
  return {
    id: r.id,
    doc: JSON.parse(r.doc ?? "{}") as SurveyDoc,
    currentStep: (r.current_step ?? "project_arrival") as StoredSurvey["currentStep"],
    status: r.status === "submitted" ? "submitted" : "draft",
    syncStatus: r.sync_status as StoredSurvey["syncStatus"],
    syncError: r.sync_error,
    syncAttempts: r.sync_attempts ?? 0,
    nextRetryAt: r.next_retry_at,
    serverPosted: Boolean(r.server_posted),
    ownerEmail: r.owner_email,
    deviceId: r.device_id,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToPhoto(r: PhotoRowV2): CapturedPhoto {
  return {
    id: r.id,
    surveyId: r.survey_id,
    relPath: r.rel_path ?? r.file_path,
    annotatedRelPath: r.annotated_rel_path,
    mimeType: r.mime_type,
    stepId: r.step_id as SurveyStepId,
    sectionId: r.section_id,
    slotId: r.slot_id,
    planeId: r.plane_id,
    required: Boolean(r.required),
    captureOrder: r.capture_order,
    capturedAt: r.captured_at,
    gps:
      r.gps_lat !== null && r.gps_lng !== null
        ? { lat: r.gps_lat, lng: r.gps_lng, alt: r.gps_alt }
        : null,
    heading: r.heading,
    notes: r.notes ?? "",
    retakeReason: r.retake_reason,
    qualityStatus: (r.quality_status ?? "accepted") as CapturedPhoto["qualityStatus"],
    blurScore: r.blur_score,
    qualityFlags: r.quality_flags ? r.quality_flags.split(",").filter(Boolean) : [],
    ahash: r.ahash,
    markup: r.markup_json ? (JSON.parse(r.markup_json) as unknown[]) : null,
    uploadState: r.upload_state === "uploaded" ? "uploaded" : "local",
    serverPhotoId: r.server_photo_id,
  };
}

/** Columns the legacy list/detail code still reads, kept in step with the doc. */
function listingColumns(doc: SurveyDoc) {
  const install = INSTALL_TYPES.find((t) => t.id === doc.installType);
  const address = typeof doc.answers.site_address === "string" ? doc.answers.site_address : "";
  const name = doc.project.projectName.trim() || address || "Site survey";
  return {
    project_name: name,
    site_name: name,
    site_address: address,
    category_id: doc.installType,
    category_name: install?.label ?? doc.installType,
    inspector_name: doc.inspectorName || "Unknown",
    latitude: doc.gps?.lat ?? null,
    longitude: doc.gps?.lng ?? null,
    gps_accuracy: doc.gps?.accuracy ?? null,
    notes: doc.notes,
    solarpro_project_id: doc.project.solarproProjectId,
    solarpro_org_id: doc.project.solarproClientId,
    solarpro_user_id: doc.project.handoff?.solarproUserId ?? null,
    solarpro_email: doc.project.handoff?.solarproEmail ?? null,
  };
}

export async function createSurveyDraft(input: {
  doc: SurveyDoc;
  deviceId: string | null;
  ownerEmail: string | null;
}): Promise<string> {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();
  const c = listingColumns(input.doc);
  await db.runAsync(
    `INSERT INTO surveys
       (id, project_name, category_id, category_name, inspector_name, site_name, site_address,
        latitude, longitude, gps_accuracy, survey_date, notes, status, sync_status, device_id,
        solarpro_user_id, solarpro_project_id, solarpro_email, solarpro_org_id, metadata,
        doc, current_step, owner_email, sync_attempts, server_posted, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft','local',?,?,?,?,?,NULL,?,?,?,0,0,?,?)`,
    [
      id, c.project_name, c.category_id, c.category_name, c.inspector_name, c.site_name, c.site_address,
      c.latitude, c.longitude, c.gps_accuracy, input.doc.arrivedAt, c.notes, input.deviceId,
      c.solarpro_user_id, c.solarpro_project_id, c.solarpro_email, c.solarpro_org_id,
      JSON.stringify(input.doc), "project_arrival", input.ownerEmail, now, now,
    ],
  );
  return id;
}

/** An in-progress survey for this SolarPro project, if there is one. */
export async function findDraftForProject(solarproProjectId: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ id: string }>(
    `SELECT id FROM surveys
      WHERE doc IS NOT NULL AND status = 'draft' AND solarpro_project_id = ?
      ORDER BY updated_at DESC LIMIT 1`,
    [solarproProjectId],
  );
  return row?.id ?? null;
}

export async function loadSurvey(id: string): Promise<{ survey: StoredSurvey; photos: CapturedPhoto[] } | null> {
  const db = getDb();
  const row = await db.getFirstAsync<SurveyRowV2>("SELECT * FROM surveys WHERE id = ? AND doc IS NOT NULL", [id]);
  if (!row) return null;
  return { survey: rowToSurvey(row), photos: await loadPhotos(id) };
}

export async function loadPhotos(surveyId: string): Promise<CapturedPhoto[]> {
  const db = getDb();
  const rows = await db.getAllAsync<PhotoRowV2>(
    "SELECT * FROM survey_photos WHERE survey_id = ? AND slot_id IS NOT NULL ORDER BY capture_order ASC",
    [surveyId],
  );
  return rows.map(rowToPhoto);
}

/** Save the doc (called on every change, debounced by the screen). */
export async function saveDoc(id: string, doc: SurveyDoc, currentStep: StoredSurvey["currentStep"]): Promise<void> {
  const db = getDb();
  const c = listingColumns(doc);
  await db.runAsync(
    `UPDATE surveys
        SET doc = ?, current_step = ?, project_name = ?, site_name = ?, site_address = ?,
            category_id = ?, category_name = ?, inspector_name = ?, latitude = ?, longitude = ?,
            gps_accuracy = ?, notes = ?, solarpro_project_id = ?, solarpro_org_id = ?,
            solarpro_user_id = ?, solarpro_email = ?, updated_at = ?
      WHERE id = ?`,
    [
      JSON.stringify(doc), currentStep, c.project_name, c.site_name, c.site_address,
      c.category_id, c.category_name, c.inspector_name, c.latitude, c.longitude,
      c.gps_accuracy, c.notes, c.solarpro_project_id, c.solarpro_org_id,
      c.solarpro_user_id, c.solarpro_email, new Date().toISOString(), id,
    ],
  );
}

export async function insertPhoto(p: CapturedPhoto): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO survey_photos
       (id, survey_id, file_path, label, mime_type, captured_at, created_at,
        rel_path, annotated_rel_path, step_id, section_id, slot_id, plane_id, required,
        capture_order, gps_lat, gps_lng, gps_alt, heading, notes, retake_reason,
        quality_status, blur_score, upload_state, server_photo_id, quality_flags, ahash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      p.id, p.surveyId, p.relPath, p.slotId, p.mimeType, p.capturedAt, new Date().toISOString(),
      p.relPath, p.annotatedRelPath, p.stepId, p.sectionId, p.slotId, p.planeId, p.required ? 1 : 0,
      p.captureOrder, p.gps?.lat ?? null, p.gps?.lng ?? null, p.gps?.alt ?? null, p.heading,
      p.notes, p.retakeReason, p.qualityStatus, p.blurScore, p.uploadState, p.serverPhotoId,
      (p.qualityFlags ?? []).join(","), p.ahash ?? null,
    ],
  );
  await touch(p.surveyId);
}

export async function updatePhoto(
  id: string,
  patch: Partial<Pick<CapturedPhoto, "notes" | "qualityStatus" | "annotatedRelPath" | "retakeReason" | "markup">>,
): Promise<void> {
  const db = getDb();
  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (patch.notes !== undefined) { sets.push("notes = ?"); args.push(patch.notes); }
  if (patch.qualityStatus !== undefined) { sets.push("quality_status = ?"); args.push(patch.qualityStatus); }
  if (patch.annotatedRelPath !== undefined) {
    // A new markup must be uploaded again.
    sets.push("annotated_rel_path = ?", "upload_state = 'local'", "server_photo_id = NULL");
    args.push(patch.annotatedRelPath);
  }
  if (patch.retakeReason !== undefined) { sets.push("retake_reason = ?"); args.push(patch.retakeReason); }
  if (patch.markup !== undefined) { sets.push("markup_json = ?"); args.push(patch.markup ? JSON.stringify(patch.markup) : null); }
  if (!sets.length) return;
  await db.runAsync(`UPDATE survey_photos SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
}

/** Remove a photo row and its files. */
export async function removePhoto(photo: CapturedPhoto): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM survey_photos WHERE id = ?", [photo.id]);
  for (const rel of [photo.relPath, photo.annotatedRelPath]) {
    if (!rel) continue;
    try {
      await FileSystem.deleteAsync(absPath(rel), { idempotent: true });
    } catch {
      // file already gone
    }
  }
  await touch(photo.surveyId);
}

async function touch(surveyId: string): Promise<void> {
  await getDb().runAsync("UPDATE surveys SET updated_at = ? WHERE id = ?", [new Date().toISOString(), surveyId]);
}

export async function submitSurvey(id: string): Promise<void> {
  const now = new Date().toISOString();
  await getDb().runAsync(
    `UPDATE surveys
        SET status = 'submitted', sync_status = 'pending', sync_error = NULL, sync_attempts = 0,
            next_retry_at = NULL, current_step = 'review', submitted_at = ?, updated_at = ?
      WHERE id = ?`,
    [now, now, id],
  );
}

/** Back to editing (only before it has fully uploaded). Like Scanifly's "reset to draft". */
export async function reopenSurvey(id: string): Promise<boolean> {
  // Allowed until fully uploaded, even mid-upload: the uploader checks the
  // status before each photo and before completing, and stops.
  const res = await getDb().runAsync(
    `UPDATE surveys
        SET status = 'draft', sync_status = 'local', sync_error = NULL, next_retry_at = NULL,
            updated_at = ?
      WHERE id = ? AND status = 'submitted' AND sync_status IN ('pending', 'error', 'syncing')`,
    [new Date().toISOString(), id],
  );
  return (res.changes ?? 0) > 0;
}

export async function deleteSurveyAndFiles(id: string): Promise<void> {
  const photos = await loadPhotos(id);
  for (const p of photos) await removePhoto(p);
  await getDb().runAsync("DELETE FROM surveys WHERE id = ?", [id]);
}

// ── Sync bookkeeping ────────────────────────────────────────────

/**
 * Submitted surveys waiting to upload. Only the signed-in surveyor's (or
 * unowned) surveys are returned: someone else's work waits for them.
 */
export async function surveysDueForSync(
  nowIso: string,
  includeNotDue = false,
  ownerEmail: string | null = null,
): Promise<StoredSurvey[]> {
  const rows = await getDb().getAllAsync<SurveyRowV2>(
    `SELECT * FROM surveys
      WHERE doc IS NOT NULL AND status = 'submitted' AND sync_status IN ('pending', 'error')
        AND (? OR next_retry_at IS NULL OR next_retry_at <= ?)
        AND (owner_email IS NULL OR ? IS NULL OR lower(owner_email) = lower(?))
      ORDER BY submitted_at ASC`,
    [includeNotDue ? 1 : 0, nowIso, ownerEmail, ownerEmail],
  );
  return rows.map(rowToSurvey);
}

/** Claim a survey for upload; false if it was reopened or another pass has it. */
export async function markSyncing(id: string): Promise<boolean> {
  const res = await getDb().runAsync(
    `UPDATE surveys SET sync_status = 'syncing', updated_at = ?
      WHERE id = ? AND status = 'submitted' AND sync_status IN ('pending', 'error')`,
    [new Date().toISOString(), id],
  );
  return (res.changes ?? 0) > 0;
}

export async function isStillSubmitted(id: string): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ status: string }>("SELECT status FROM surveys WHERE id = ?", [id]);
  return row?.status === "submitted";
}

export async function markPosted(id: string): Promise<void> {
  await getDb().runAsync("UPDATE surveys SET server_posted = 1 WHERE id = ?", [id]);
}

export async function markPhotoUploaded(photoId: string, serverPhotoId: string | null): Promise<void> {
  await getDb().runAsync(
    "UPDATE survey_photos SET upload_state = 'uploaded', server_photo_id = ? WHERE id = ?",
    [serverPhotoId, photoId],
  );
}

export async function markSynced(id: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE surveys SET sync_status = 'synced', sync_error = NULL, next_retry_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'submitted'`,
    [new Date().toISOString(), id],
  );
}

export async function markSyncError(id: string, message: string, attempts: number, nextRetryAt: string | null): Promise<void> {
  await getDb().runAsync(
    `UPDATE surveys
        SET sync_status = 'error', sync_error = ?, sync_attempts = ?, next_retry_at = ?, updated_at = ?
      WHERE id = ? AND status = 'submitted'`,
    [message, attempts, nextRetryAt, new Date().toISOString(), id],
  );
}

/** Rows stuck in 'syncing' after the app was killed go back to the queue. */
export async function recoverInterruptedSyncs(): Promise<void> {
  await getDb().runAsync(
    "UPDATE surveys SET sync_status = 'pending' WHERE doc IS NOT NULL AND sync_status = 'syncing'",
  );
}

export interface SurveySummary {
  id: string;
  title: string;
  address: string;
  installType: string;
  status: "draft" | "submitted";
  syncStatus: StoredSurvey["syncStatus"];
  syncError: string | null;
  nextRetryAt: string | null;
  currentStep: StoredSurvey["currentStep"];
  photoCount: number;
  uploadedCount: number;
  updatedAt: string;
  ownerEmail: string | null;
  legacy: boolean;
}

export async function listSurveySummaries(): Promise<SurveySummary[]> {
  const rows = await getDb().getAllAsync<{
    id: string; project_name: string; site_address: string; category_id: string | null;
    status: string; sync_status: string; sync_error: string | null; next_retry_at: string | null;
    current_step: string | null; doc: string | null; updated_at: string; owner_email: string | null;
    photo_count: number; uploaded_count: number;
  }>(
    `SELECT s.id, s.project_name, s.site_address, s.category_id, s.status, s.sync_status, s.sync_error,
            s.next_retry_at, s.current_step, s.doc IS NOT NULL AS doc, s.updated_at, s.owner_email,
            (SELECT COUNT(*) FROM survey_photos p WHERE p.survey_id = s.id) AS photo_count,
            (SELECT COUNT(*) FROM survey_photos p WHERE p.survey_id = s.id AND p.upload_state = 'uploaded') AS uploaded_count
       FROM surveys s
      ORDER BY s.updated_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.project_name,
    address: r.site_address ?? "",
    installType: r.category_id ?? "",
    status: r.status === "submitted" || !r.doc ? "submitted" : "draft",
    syncStatus: r.sync_status as StoredSurvey["syncStatus"],
    syncError: r.sync_error,
    nextRetryAt: r.next_retry_at,
    currentStep: (r.current_step ?? "project_arrival") as StoredSurvey["currentStep"],
    photoCount: Number(r.photo_count),
    uploadedCount: Number(r.uploaded_count),
    updatedAt: r.updated_at,
    ownerEmail: r.owner_email,
    legacy: !r.doc,
  }));
}
