// ============================================================
// Install & final photos: one shared job per SolarPro project, used by the
// whole crew from their own phones.
//
// - Every phone derives the same job id from the project id (UUIDv5), so a
//   crew can start offline and still land on one job.
// - Photos upload as soon as they're taken (not on submit); the other crew
//   members' photos are fetched and shown in the same slots.
// - Answers merge per field on the server; this phone only sends the fields
//   it changed, so it never overwrites a crew mate's entry with stale data.
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ServerInstallJob, ServerJobPhoto } from "../api/client";
import type { AnswerValue } from "./blueprint";
import { findSlot } from "./blueprint";
import type { CapturedPhoto, SurveyDoc } from "./model";
import { goldenBlock, markupClientId, photoLabel } from "./payload";
import type { StoredSurvey } from "./repo";

// ---------- job id (UUIDv5) ----------

/** Same namespace as the backend (routes/surveys.ts). Never change. */
export const INSTALL_JOB_NAMESPACE = "3f6c1d2e-8a4b-4c7d-9e21-5b0a7f4c2d19";

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of unescape(encodeURIComponent(s))) out.push(ch.charCodeAt(0));
  return out;
}

/** SHA-1 (RFC 3174), small and dependency-free; used only for the job id. */
export function sha1(bytes: number[]): number[] {
  const ml = bytes.length * 8;
  const msg = [...bytes, 0x80];
  while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 7; i >= 0; i--) msg.push(Math.floor(ml / 2 ** (8 * i)) & 0xff);
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  for (let off = 0; off < msg.length; off += 64) {
    const w: number[] = [];
    for (let i = 0; i < 16; i++) {
      w[i] = ((msg[off + 4 * i] << 24) | (msg[off + 4 * i + 1] << 16) | (msg[off + 4 * i + 2] << 8) | msg[off + 4 * i + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const t = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].flatMap((h) => [h >>> 24, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff]);
}

export function installJobId(solarproProjectId: string): string {
  const ns = INSTALL_JOB_NAMESPACE.replace(/-/g, "").match(/../g)!.map((x) => parseInt(x, 16));
  const b = sha1([...ns, ...utf8(`install:${solarproProjectId}`)]).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- crew photos ----------

/** A server photo taken by someone else, shaped for the slot tiles. null if it isn't a slot photo. */
export function crewPhotoFromServer(jobId: string, p: ServerJobPhoto, url: string, markupUrl: string | null): CapturedPhoto | null {
  const meta = (p.meta ?? {}) as Record<string, unknown>;
  const slotId = typeof meta.photoSlotId === "string" ? meta.photoSlotId : typeof meta.slotId === "string" ? meta.slotId : null;
  if (!slotId || meta.markupOf) return null;
  const found = findSlot(slotId);
  if (!found) return null;
  const gps = meta.gps as { lat?: number; lng?: number; alt?: number | null } | null | undefined;
  return {
    id: (p.client_photo_id ?? p.id) as string,
    surveyId: jobId,
    relPath: url,
    annotatedRelPath: markupUrl,
    mimeType: "image/jpeg",
    stepId: found.step.id,
    sectionId: found.section.id,
    slotId,
    planeId: null,
    required: found.slot.required,
    captureOrder: 0,
    capturedAt: (typeof meta.timestamp === "string" ? meta.timestamp : p.captured_at) ?? new Date(0).toISOString(),
    gps: gps && typeof gps.lat === "number" && typeof gps.lng === "number" ? { lat: gps.lat, lng: gps.lng, alt: gps.alt ?? null } : null,
    heading: typeof meta.heading === "number" ? meta.heading : null,
    notes: typeof meta.notes === "string" ? meta.notes : "",
    retakeReason: null,
    qualityStatus: meta.qualityStatus === "pending_review" ? "pending_review" : "accepted",
    blurScore: typeof meta.blurScore === "number" ? meta.blurScore : null,
    qualityFlags: Array.isArray(meta.qualityFlags) ? (meta.qualityFlags as string[]) : [],
    uploadState: "uploaded",
    serverPhotoId: p.id,
    crew: {
      creatorName: typeof meta.creatorName === "string" ? meta.creatorName : null,
      creatorEmail: typeof meta.creatorEmail === "string" ? meta.creatorEmail : null,
    },
    creatorName: typeof meta.creatorName === "string" ? meta.creatorName : null,
  };
}

/** Crew photos from a server job, minus the ones this phone has. */
export function crewPhotos(job: ServerInstallJob, localIds: Set<string>, urlFor: (p: ServerJobPhoto) => string): CapturedPhoto[] {
  const markups = new Map<string, string>();
  for (const p of job.photos) {
    const of = (p.meta as Record<string, unknown> | null)?.markupOf;
    if (typeof of === "string") markups.set(of, urlFor(p));
  }
  const out: CapturedPhoto[] = [];
  for (const p of job.photos) {
    if (p.client_photo_id && localIds.has(p.client_photo_id)) continue;
    const cid = p.client_photo_id ?? p.id;
    const c = crewPhotoFromServer(job.id, p, urlFor(p), markups.get(cid) ?? null);
    if (c) out.push(c);
  }
  return out.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

const crewCache = new Map<string, CapturedPhoto[]>();
const crewListeners = new Set<(jobId: string) => void>();

export function getCrewPhotos(jobId: string): CapturedPhoto[] {
  return crewCache.get(jobId) ?? [];
}

export function onCrewPhotos(cb: (jobId: string) => void): () => void {
  crewListeners.add(cb);
  return () => crewListeners.delete(cb);
}

export function setCrewPhotos(jobId: string, photos: CapturedPhoto[]): void {
  crewCache.set(jobId, photos);
  crewListeners.forEach((l) => l(jobId));
}

const jobDocListeners = new Set<(jobId: string, answers: SurveyDoc["answers"]) => void>();

/** The crew's answers changed (an open editor merges them in). */
export function onCrewAnswers(cb: (jobId: string, answers: SurveyDoc["answers"]) => void): () => void {
  jobDocListeners.add(cb);
  return () => jobDocListeners.delete(cb);
}

// ---------- answers this phone changed ----------

/** Field ids changed on this phone and not yet sent. Kept in doc.extra so it survives restarts. */
export function dirtyAnswerKeys(doc: SurveyDoc): string[] {
  const v = doc.extra?.installDirty;
  return Array.isArray(v) ? (v.filter((k) => typeof k === "string") as string[]) : [];
}

export function markAnswerDirty(doc: SurveyDoc, fieldId: string): SurveyDoc {
  const keys = new Set(dirtyAnswerKeys(doc));
  keys.add(fieldId);
  return { ...doc, extra: { ...doc.extra, installDirty: [...keys] } };
}

/** Take the crew's answers for every field this phone hasn't changed. */
export function mergeServerAnswers(doc: SurveyDoc, server: Record<string, unknown>): SurveyDoc {
  const dirty = new Set(dirtyAnswerKeys(doc));
  const answers = { ...doc.answers };
  for (const [k, v] of Object.entries(server)) {
    if (dirty.has(k)) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v) || Array.isArray(v)) answers[k] = v as AnswerValue;
  }
  return { ...doc, answers };
}

// ---------- deleted photos still to remove on the server ----------

const DELETES_KEY = (jobId: string) => `site-survey.install-deletes.${jobId}`;

export async function queueCrewDelete(jobId: string, clientPhotoId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DELETES_KEY(jobId));
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(clientPhotoId)) list.push(clientPhotoId);
    await AsyncStorage.setItem(DELETES_KEY(jobId), JSON.stringify(list));
  } catch {
    // best effort
  }
}

async function pendingDeletes(jobId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETES_KEY(jobId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function clearDeletes(jobId: string, done: string[]): Promise<void> {
  const left = (await pendingDeletes(jobId)).filter((x) => !done.includes(x));
  await AsyncStorage.setItem(DELETES_KEY(jobId), JSON.stringify(left));
}

// ---------- one sync pass ----------

export interface InstallSyncDeps {
  loadPhotos: (jobId: string) => Promise<CapturedPhoto[]>;
  saveDoc: (jobId: string, doc: SurveyDoc) => Promise<void>;
  putJob: typeof import("../api/client").putInstallJob;
  patchAnswers: typeof import("../api/client").patchInstallAnswers;
  deletePhoto: typeof import("../api/client").deleteJobPhoto;
  uploadPhoto: (
    jobId: string,
    photo: { uri: string; mimeType: string; label: string; clientId: string; capturedAt: string; meta: Record<string, unknown> },
  ) => Promise<{ id: string | null }>;
  markPhotoUploaded: (photoId: string, serverId: string | null, sent: CapturedPhoto) => Promise<void>;
  /** Metadata-only update for a photo already on the server (note edited). null = server lacks it. */
  updateMeta?: (jobId: string, clientId: string, label: string, meta: Record<string, unknown>) => Promise<{ id: string } | null>;
  fileExists: (relPath: string) => Promise<boolean>;
  fileUri: (relPath: string) => string;
  photoUrl: (p: ServerJobPhoto) => string;
  me: { name: string; email: string | null };
}

/**
 * Bring one install job up to date both ways: make sure the server job
 * exists, merge the crew's answers in, send this phone's changes and
 * photos, apply deletes, and refresh the crew photos. Safe to repeat.
 */
export async function syncInstallJob(survey: StoredSurvey, deps: InstallSyncDeps): Promise<{ uploaded: number; crew: number }> {
  const jobId = survey.id;
  let doc = survey.doc;
  const projectId = doc.project.solarproProjectId;
  if (!projectId) throw new Error("Install job has no SolarPro project");

  let job = await deps.putJob(jobId, {
    solarpro_project_id: projectId,
    project_name: doc.project.projectName || "Install",
    site_address: typeof doc.answers.site_address === "string" ? doc.answers.site_address : null,
    inspector_name: deps.me.name,
    solarpro_org_id: doc.project.solarproClientId,
    solarpro_email: doc.project.handoff?.solarproEmail ?? null,
  });

  // Send this phone's changed answers, then take everyone's.
  const dirty = dirtyAnswerKeys(doc);
  if (dirty.length) {
    const changed: Record<string, unknown> = {};
    for (const k of dirty) changed[k] = doc.answers[k] ?? null;
    const res = await deps.patchAnswers(jobId, changed);
    job = { ...job, metadata: { ...(job.metadata ?? {}), answers: res.answers } };
    doc = { ...doc, extra: { ...doc.extra, installDirty: [] } };
  }
  const merged = mergeServerAnswers(doc, (job.metadata?.answers ?? {}) as Record<string, unknown>);
  if (dirty.length || JSON.stringify(merged.answers) !== JSON.stringify(survey.doc.answers)) {
    await deps.saveDoc(jobId, merged);
    jobDocListeners.forEach((l) => l(jobId, merged.answers));
  }

  // Deletes made on this phone.
  const deletes = await pendingDeletes(jobId);
  const deleted: string[] = [];
  for (const cid of deletes) {
    await deps.deletePhoto(jobId, cid);
    deleted.push(cid);
  }
  if (deleted.length) await clearDeletes(jobId, deleted);

  // Upload this phone's new photos.
  const local = await deps.loadPhotos(jobId);
  let uploaded = 0;
  for (const photo of local) {
    if (photo.uploadState === "uploaded" || photo.qualityStatus === "rejected") continue;
    if (!(await deps.fileExists(photo.relPath))) continue;
    const meta = { ...goldenBlock(photo, merged), creatorName: deps.me.name, creatorEmail: deps.me.email };
    const label = photoLabel(photo);
    if (photo.serverPhotoId && deps.updateMeta) {
      const updated = await deps.updateMeta(jobId, photo.id, label, meta);
      if (updated) {
        await deps.markPhotoUploaded(photo.id, updated.id, photo);
        uploaded++;
        continue;
      }
    }
    const res = await deps.uploadPhoto(jobId, {
      uri: deps.fileUri(photo.relPath),
      mimeType: photo.mimeType,
      label,
      clientId: photo.id,
      capturedAt: photo.capturedAt,
      meta,
    });
    if (photo.annotatedRelPath && (await deps.fileExists(photo.annotatedRelPath))) {
      await deps.uploadPhoto(jobId, {
        uri: deps.fileUri(photo.annotatedRelPath),
        mimeType: "image/jpeg",
        label: `${label} (marked up)`,
        clientId: markupClientId(photo),
        capturedAt: photo.capturedAt,
        meta: { ...meta, markupOf: photo.id },
      });
    }
    await deps.markPhotoUploaded(photo.id, res.id, photo);
    uploaded++;
  }

  // Everyone else's photos (refetch only if we changed something).
  if (uploaded || deleted.length) {
    job = await deps.putJob(jobId, {
      solarpro_project_id: projectId,
      project_name: doc.project.projectName || "Install",
      site_address: null,
      inspector_name: deps.me.name,
      solarpro_org_id: doc.project.solarproClientId,
      solarpro_email: null,
    });
  }
  const localIds = new Set(local.map((p) => p.id));
  const crew = crewPhotos(job, localIds, deps.photoUrl);
  setCrewPhotos(jobId, crew);
  return { uploaded, crew: crew.length };
}
