// ============================================================
// PDF survey report, made on the phone (works offline) and shared with
// the system share sheet: answers per step, skipped items with reasons,
// and every photo with its time, location and notes.
// ============================================================

import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { INSTALL_TYPES, stepsFor } from "./blueprint";
import type { CapturedPhoto, SurveyDoc } from "./model";
import { checklistFromDoc, photoLabel, photosToSend } from "./payload";
import { surveyReadiness } from "./progress";
import { absPath } from "./repo";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function thumbDataUri(photo: CapturedPhoto): Promise<string | null> {
  try {
    const out = await ImageManipulator.manipulateAsync(absPath(photo.annotatedRelPath ?? photo.relPath), [{ resize: { width: 640 } }], {
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  }
}

export function reportHtml(doc: SurveyDoc, photos: CapturedPhoto[], images: Record<string, string | null>): string {
  const readiness = surveyReadiness(doc, photos);
  const rows = checklistFromDoc(doc, photos);
  const install = INSTALL_TYPES.find((t) => t.id === doc.installType)?.label ?? doc.installType;
  const title = doc.project.projectName || (typeof doc.answers.site_address === "string" ? doc.answers.site_address : "Site survey");
  const steps = stepsFor(doc).map((step, i) => {
    const stepPhotos = photos.filter((p) => p.stepId === step.id);
    const lines = rows[i].notes.split("\n").filter(Boolean);
    return `
      <section>
        <h2>${step.number}. ${esc(step.title)} <span class="${rows[i].status}">${rows[i].status === "pass" ? "Complete" : rows[i].status === "fail" ? "Incomplete" : "—"}</span></h2>
        ${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : `<p class="muted">No answers.</p>`}
        <div class="grid">
          ${stepPhotos
            .map(
              (p) => `<figure>
                ${images[p.id] ? `<img src="${images[p.id]}"/>` : `<div class="missing">Photo unavailable</div>`}
                <figcaption><b>${esc(photoLabel(p))}</b><br/>
                ${esc(new Date(p.capturedAt).toLocaleString())}${p.gps ? ` · ${p.gps.lat.toFixed(5)}, ${p.gps.lng.toFixed(5)}` : ""}${p.heading !== null ? ` · facing ${p.heading}°` : ""}
                ${p.qualityStatus === "pending_review" ? `<br/><span class="fail">Flagged: ${esc((p.qualityFlags ?? ["blurry"]).join(", "))}</span>` : ""}
                ${p.notes ? `<br/>${esc(p.notes)}` : ""}</figcaption>
              </figure>`,
            )
            .join("")}
        </div>
      </section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:28px;font-size:12px}
    h1{font-size:22px;margin:0} h2{font-size:16px;border-bottom:2px solid #FFB020;padding-bottom:4px;margin-top:22px}
    .meta{color:#444;margin:6px 0 14px} .muted{color:#777}
    .pass{color:#0A7A3F;font-size:12px} .fail{color:#B00020;font-size:12px}
    ul{margin:6px 0 10px 18px;padding:0} li{margin:2px 0}
    .grid{display:flex;flex-wrap:wrap;gap:10px} figure{width:48%;margin:0;page-break-inside:avoid}
    img{width:100%;border-radius:4px} figcaption{font-size:10px;color:#333;margin-top:4px}
    .missing{height:120px;background:#eee;display:flex;align-items:center;justify-content:center;color:#777}
  </style></head><body>
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(install)} · Surveyor ${esc(doc.inspectorName)} · Arrived ${esc(new Date(doc.arrivedAt).toLocaleString())}
      ${doc.gps ? ` · ${doc.gps.lat.toFixed(5)}, ${doc.gps.lng.toFixed(5)}` : ""}<br/>
      ${readiness.done}/${readiness.total} required items done · ${photos.length} photos
      ${doc.notes ? `<br/><b>Notes:</b> ${esc(doc.notes)}` : ""}</div>
    ${steps}
  </body></html>`;
}

/** Build the PDF and open the share sheet. Returns the file path. */
export async function shareSurveyPdf(doc: SurveyDoc, allPhotos: CapturedPhoto[]): Promise<string> {
  const photos = photosToSend(doc, allPhotos);
  const images: Record<string, string | null> = {};
  for (const p of photos) images[p.id] = await thumbDataUri(p);
  const { uri } = await Print.printToFileAsync({ html: reportHtml(doc, photos, images) });
  const safe = (doc.project.projectName || "site-survey").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const dest = `${FileSystem.cacheDirectory ?? ""}${safe || "site-survey"}-survey.pdf`;
  await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
  await FileSystem.moveAsync({ from: uri, to: dest });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, { mimeType: "application/pdf", dialogTitle: "Share survey report", UTI: "com.adobe.pdf" });
  }
  return dest;
}
