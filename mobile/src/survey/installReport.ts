// ============================================================
// Install & final photo report (PDF), made on the phone: a cover, a
// checklist page (done / skipped with reason / missing), then every photo
// grouped by phase and section with caption, note, time, who took it and
// GPS. Same layout every job — a step up from a hand-captioned photo dump.
// ============================================================

import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { SurveyStepId } from "../types/pipeline";
import { stepsFor } from "./blueprint";
import type { CapturedPhoto, SurveyDoc } from "./model";
import { photosForSlot, stepProgress } from "./progress";
import { absPath } from "./repo";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

export interface InstallReportOptions {
  /** Only this phase (default: both). */
  phase?: SurveyStepId | null;
  companyName?: string;
  logo?: string | null;
  /** Who's sharing it (default: crew). */
  preparedBy?: string;
}

function answerText(v: unknown, unit?: string): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v === null || v === undefined || v === "") return "—";
  return `${Array.isArray(v) ? v.join(", ") : String(v)}${unit ? ` ${unit}` : ""}`;
}

export function installReportHtml(
  doc: SurveyDoc,
  photos: CapturedPhoto[],
  images: Record<string, string | null>,
  opts: InstallReportOptions = {},
): string {
  const steps = stepsFor(doc).filter((s) => !opts.phase || s.id === opts.phase);
  const usable = photos.filter((p) => p.qualityStatus !== "rejected" && steps.some((s) => s.id === p.stepId));
  const sorted = [...usable].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const crew = [...new Set(usable.map((p) => p.crew?.creatorName ?? p.creatorName ?? doc.inspectorName).filter(Boolean))];
  const title = doc.project.projectName || (typeof doc.answers.site_address === "string" ? doc.answers.site_address : "Install");
  const address = typeof doc.answers.site_address === "string" ? doc.answers.site_address : "";
  const range = sorted.length ? (day(sorted[0].capturedAt) === day(sorted[sorted.length - 1].capturedAt) ? day(sorted[0].capturedAt) : `${day(sorted[0].capturedAt)} – ${day(sorted[sorted.length - 1].capturedAt)}`) : "";
  const heroSlots = ["fin_array_ground", "fin_house_final", "inst_rails_wide", "fin_equipment_final"];
  const hero = heroSlots.map((id) => usable.find((p) => p.slotId === id && images[p.id])).find(Boolean) ?? usable.find((p) => images[p.id]);
  const phaseTitle = opts.phase ? steps[0]?.title : "Install & final inspection";
  const overrides = new Map(doc.overrides.map((o) => [o.key, o.reason]));

  let n = 0;
  const checklist = steps
    .map((step) => {
      const sp = stepProgress(doc, photos, step.id);
      const rows = step.sections
        .map((sec) => {
          const fields = sec.fields
            .map((f) => `<tr><td class="lbl">${esc(f.label)}</td><td colspan="2">${esc(answerText(doc.answers[f.id], f.unit))}</td></tr>`)
            .join("");
          const slots = sec.slots
            .map((sl) => {
              const count = photosForSlot(usable, sl.id, null).length;
              const skipped = overrides.get(sl.id);
              const state = count ? `<span class="ok">✓ ${count} photo${count > 1 ? "s" : ""}</span>` : skipped ? `<span class="skip">Skipped — ${esc(skipped)}</span>` : sl.required ? `<span class="miss">Missing</span>` : `<span class="muted">—</span>`;
              return `<tr><td class="lbl">${esc(sl.label)}${sl.required ? "" : ' <span class="muted">(optional)</span>'}</td><td colspan="2">${state}</td></tr>`;
            })
            .join("");
          return `<tr class="sec"><td colspan="3">${esc(sec.title)}</td></tr>${fields}${slots}`;
        })
        .join("");
      const missing = sp.items.filter((i) => !i.done && !i.overridden).length;
      return `<h3>${esc(step.title)} <span class="${missing ? "miss" : "ok"}">${missing ? `${missing} missing` : "Complete"}</span></h3><table class="check">${rows}</table>`;
    })
    .join("");

  const body = steps
    .map((step) => {
      const secs = step.sections
        .map((sec) => {
          const secPhotos = sec.slots.flatMap((sl) =>
            photosForSlot(usable, sl.id, null)
              .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
              .map((p, i, arr) => ({ p, label: arr.length > 1 ? `${sl.label} (${i + 1})` : sl.label })),
          );
          if (!secPhotos.length) return "";
          return `<h3 class="secTitle">${esc(sec.title)}</h3><div class="grid">${secPhotos
            .map(({ p, label }) => {
              n++;
              const who = p.crew?.creatorName ?? p.creatorName ?? doc.inspectorName;
              return `<figure>
                <div class="num">${n}</div>
                ${images[p.id] ? `<img src="${images[p.id]}"/>` : `<div class="missing">Photo not available offline</div>`}
                <figcaption><b>${esc(label)}</b>${p.notes ? `<div class="note">${esc(p.notes)}</div>` : ""}
                <div class="meta">${esc(fmt(p.capturedAt))}${who ? ` · ${esc(who)}` : ""}${p.gps ? ` · ${p.gps.lat.toFixed(5)}, ${p.gps.lng.toFixed(5)}` : ""}</div></figcaption>
              </figure>`;
            })
            .join("")}</div>`;
        })
        .join("");
      return secs ? `<section class="phase"><h2>${esc(step.title)}</h2>${secs}</section>` : "";
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { margin: 14mm 12mm; }
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #111827; font-size: 11px; }
    .cover { text-align: center; page-break-after: always; padding-top: 30px; }
    .cover .logo { max-width: 220px; max-height: 110px; margin: 10px auto 18px; display: block; }
    .cover h1 { font-size: 26px; margin: 8px 0 4px; }
    .cover .sub { color: #4b5563; font-size: 13px; margin: 2px 0; }
    .cover .hero { width: 100%; max-height: 430px; object-fit: cover; border-radius: 8px; margin-top: 18px; }
    .facts { display: flex; justify-content: center; gap: 28px; margin-top: 14px; }
    .facts div { font-size: 12px; } .facts b { display: block; font-size: 18px; }
    h2 { font-size: 18px; border-bottom: 3px solid #F59E0B; padding-bottom: 4px; margin: 0 0 8px; }
    h3 { font-size: 13px; margin: 14px 0 6px; }
    .checkPage { page-break-after: always; }
    table.check { width: 100%; border-collapse: collapse; }
    table.check td { border-bottom: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: top; }
    table.check td.lbl { width: 55%; }
    tr.sec td { background: #f3f4f6; font-weight: 700; }
    .ok { color: #047857; font-weight: 700; } .miss { color: #b91c1c; font-weight: 700; } .skip { color: #92400e; } .muted { color: #9ca3af; }
    .phase { page-break-before: always; }
    .secTitle { color: #0B2545; }
    .grid { display: flex; flex-wrap: wrap; gap: 10px; }
    figure { width: calc(50% - 5px); margin: 0; page-break-inside: avoid; position: relative; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    figure img { width: 100%; height: 230px; object-fit: cover; display: block; }
    .missing { height: 230px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; color: #6b7280; }
    .num { position: absolute; top: 6px; left: 6px; background: #fff; border-radius: 4px; padding: 1px 6px; font-weight: 700; font-size: 11px; }
    figcaption { padding: 6px 8px 8px; } .note { margin-top: 2px; } .meta { color: #6b7280; margin-top: 3px; font-size: 10px; }
  </style></head><body>
    <div class="cover">
      ${opts.logo ? `<img class="logo" src="${opts.logo}"/>` : `<div class="sub" style="font-weight:700">${esc(opts.companyName ?? "")}</div>`}
      <div class="sub">${esc(phaseTitle ?? "")}</div>
      <h1>${esc(title)}</h1>
      ${address ? `<div class="sub">${esc(address)}</div>` : ""}
      <div class="facts"><div><b>${usable.length}</b>Photos</div><div><b>${range || "—"}</b>Dates</div><div><b>${crew.length}</b>Crew</div></div>
      ${crew.length ? `<div class="sub" style="margin-top:6px">${esc(crew.join(", "))}</div>` : ""}
      ${hero && images[hero.id] ? `<img class="hero" src="${images[hero.id]}"/>` : ""}
    </div>
    <div class="checkPage"><h2>Checklist</h2>${checklist}</div>
    ${body}
  </body></html>`;
}

async function toDataUri(uri: string): Promise<string | null> {
  try {
    let local = uri;
    if (/^https?:\/\//.test(uri)) {
      const dest = `${FileSystem.cacheDirectory ?? ""}rpt-${Math.abs(hash(uri))}.jpg`;
      const got = await FileSystem.downloadAsync(uri, dest);
      if (got.status !== 200) return null;
      local = got.uri;
    }
    const out = await ImageManipulator.manipulateAsync(local, [{ resize: { width: 720 } }], {
      compress: 0.62,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const COMPANY_LOGO = "https://img1.wsimg.com/isteam/ip/b4ef19f7-7f46-446b-bbe2-755512fcd4f8/UNDER%20THE%20SUN%20LOGO.jpg/:/rs=w:600,h:300,m";

/** Build the PDF and open the share sheet. Uses the crew's photos too (needs signal for those). */
export async function shareInstallPdf(doc: SurveyDoc, photos: CapturedPhoto[], phase?: SurveyStepId | null): Promise<void> {
  const images: Record<string, string | null> = {};
  const list = photos.filter((p) => p.qualityStatus !== "rejected");
  // A few at a time keeps memory down on older phones.
  for (let i = 0; i < list.length; i += 4) {
    await Promise.all(
      list.slice(i, i + 4).map(async (p) => {
        images[p.id] = await toDataUri(absPath(p.annotatedRelPath ?? p.relPath));
      }),
    );
  }
  const logo = await toDataUri(COMPANY_LOGO);
  const html = installReportHtml(doc, photos, images, { phase, companyName: "Under The Sun Solar", logo });
  const { uri } = await Print.printToFileAsync({ html });
  const name = `${(doc.project.projectName || "install").replace(/[^\w-]+/g, "_")}_${phase === "install_day" ? "install" : phase === "final_inspection" ? "final" : "install_final"}_report.pdf`;
  const dest = `${FileSystem.cacheDirectory ?? ""}${name}`;
  await FileSystem.moveAsync({ from: uri, to: dest }).catch(() => undefined);
  const out = (await FileSystem.getInfoAsync(dest)).exists ? dest : uri;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(out, { mimeType: "application/pdf", dialogTitle: name, UTI: "com.adobe.pdf" });
  }
}
