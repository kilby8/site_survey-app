import { encode as encodeJpeg } from "jpeg-js";
import { allFieldIds, allSlotIds, findSlot, STEPS } from "../blueprint";
import { newSurveyDoc, nextPlaneId, slotKey, type CapturedPhoto, type SurveyDoc } from "../model";
import { buildSurveyPayload, goldenBlock, legacyMetadata, photoLabel } from "../payload";
import { conditionHolds, sectionInstances, stepProgress, surveyReadiness } from "../progress";
import {
  base64ToBytes,
  BLUR_THRESHOLD,
  isBlurry,
  laplacianVariance,
  sharpnessFromJpegBase64,
} from "../quality";

function doc(installType: SurveyDoc["installType"] = "roof_mount"): SurveyDoc {
  return newSurveyDoc({
    installType,
    project: { solarproProjectId: "p1", solarproClientId: "c1", projectName: "Smith", clientName: "Smith" },
    inspectorName: "Tech",
    siteAddress: "1 Main St",
    now: "2026-10-11T12:00:00.000Z",
  });
}

let seq = 0;
function photo(slotId: string, planeId: string | null = null, extra: Partial<CapturedPhoto> = {}): CapturedPhoto {
  const found = findSlot(slotId)!;
  seq++;
  return {
    id: `ph${seq}`,
    surveyId: "s1",
    relPath: `survey-photos/ph${seq}.jpg`,
    annotatedRelPath: null,
    mimeType: "image/jpeg",
    stepId: found.step.id,
    sectionId: found.section.id,
    slotId,
    planeId,
    required: found.slot.required,
    captureOrder: seq,
    capturedAt: new Date(Date.UTC(2026, 9, 11, 12, 0, seq)).toISOString(),
    gps: { lat: 41, lng: -88, alt: null },
    heading: 180,
    notes: "",
    retakeReason: null,
    qualityStatus: "accepted",
    blurScore: 120,
    uploadState: "local",
    serverPhotoId: null,
    ...extra,
  };
}

describe("blueprint", () => {
  it("follows the spec step order", () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      "project_arrival",
      "site_walkaround",
      "utility_service",
      "electrical_equipment",
      "roof_array",
    ]);
  });

  it("has unique field and slot ids", () => {
    const fields = allFieldIds();
    const slots = allSlotIds();
    expect(new Set(fields).size).toBe(fields.length);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("gives every slot a SolarPro requirement and usage mapping", () => {
    for (const id of allSlotIds()) {
      const { slot } = findSlot(id)!;
      expect(slot.requirementId).toMatch(/^[A-Z]+-[A-Z-]+$/);
      expect(slot.usage.length).toBeGreaterThan(0);
    }
  });

  it("covers the spec's Front/Back/Left/Right elevations and riser/mast", () => {
    const ids = allSlotIds();
    for (const id of ["walk_front", "walk_back", "walk_left", "walk_right", "utility_riser", "elec_bus_label"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("conditions and sections", () => {
  it("shows hazard details only when hazards are present", () => {
    const d = doc();
    const arrival = STEPS[0];
    const hidden = sectionInstances(d, arrival)[0];
    expect(hidden.fields.map((f) => f.id)).not.toContain("hazards_notes");
    expect(hidden.slots.map((s) => s.id)).not.toContain("arrival_hazards");

    d.answers.hazards_present = true;
    const shown = sectionInstances(d, arrival)[0];
    expect(shown.fields.map((f) => f.id)).toContain("hazards_notes");
    expect(shown.slots.map((s) => s.id)).toContain("arrival_hazards");
  });

  it("asks for the mast only on overhead service", () => {
    const d = doc();
    d.answers.service_type = "Underground";
    let slots = sectionInstances(d, STEPS[2])[0].slots.map((s) => s.id);
    expect(slots).not.toContain("utility_riser");
    expect(slots).toContain("utility_lateral");
    d.answers.service_type = "Overhead";
    slots = sectionInstances(d, STEPS[2])[0].slots.map((s) => s.id);
    expect(slots).toContain("utility_riser");
  });

  it("repeats the roof plane section per plane and hides it for ground mounts", () => {
    const d = doc();
    d.planes.push({ id: nextPlaneId(d.planes), answers: {} });
    const planes = sectionInstances(d, STEPS[4]).filter((i) => i.section.id === "roof_plane");
    expect(planes.map((p) => p.planeId)).toEqual(["A", "B"]);

    const g = doc("ground_mount");
    const ids = sectionInstances(g, STEPS[4]).map((i) => i.section.id);
    expect(ids).toEqual(["ground_array"]);
  });

  it("asks for obstruction photos unless the plane has none", () => {
    expect(conditionHolds({ field: "obstructions", hasOtherThan: ["None"] }, { obstructions: ["None"] }, "roof_mount")).toBe(false);
    expect(conditionHolds({ field: "obstructions", hasOtherThan: ["None"] }, { obstructions: ["Skylight"] }, "roof_mount")).toBe(true);
  });

  it("treats an unanswered notEquals as hidden", () => {
    expect(conditionHolds({ field: "shading", notEquals: "None" }, {}, "roof_mount")).toBe(false);
    expect(conditionHolds({ field: "shading", notEquals: "None" }, { shading: "Light" }, "roof_mount")).toBe(true);
  });
});

describe("progress and readiness", () => {
  it("counts required fields and slots per step", () => {
    const d = doc();
    const before = stepProgress(d, [], "project_arrival");
    // site_address, access_path, hazards_present + address, front, access photos
    expect(before.total).toBe(6);
    expect(before.done).toBe(1); // address prefilled

    d.answers.access_path = "Side gate";
    d.answers.hazards_present = false;
    const photos = [photo("arrival_address"), photo("arrival_front"), photo("arrival_access")];
    const after = stepProgress(d, photos, "project_arrival");
    expect(after.done).toBe(after.total);
  });

  it("does not count rejected photos and scopes plane photos by plane", () => {
    const d = doc();
    d.planes.push({ id: "B", answers: {} });
    const photos = [photo("roof_plane_wide", "A"), photo("roof_plane_wide", "B", { qualityStatus: "rejected" })];
    const sp = stepProgress(d, photos, "roof_array");
    const a = sp.items.find((i) => i.key === slotKey("roof_plane_wide", "A"))!;
    const b = sp.items.find((i) => i.key === slotKey("roof_plane_wide", "B"))!;
    expect(a.done).toBe(true);
    expect(b.done).toBe(false);
  });

  it("blocks submit until gaps are filled or overridden with a reason", () => {
    const d = doc();
    const r1 = surveyReadiness(d, []);
    expect(r1.ready).toBe(false);
    expect(r1.missing.length).toBe(r1.total - r1.done);

    d.overrides = r1.missing.map((m) => ({ key: m.key, reason: "Customer not home", at: "x" }));
    expect(surveyReadiness(d, []).ready).toBe(true);
  });

  it("blocks submit on a blurry photo kept without a reason", () => {
    const d = doc();
    d.overrides = surveyReadiness(d, []).missing.map((m) => ({ key: m.key, reason: "n/a", at: "x" }));
    const blurry = photo("arrival_front", null, { qualityStatus: "pending_review", blurScore: 3 });
    expect(surveyReadiness(d, [blurry]).ready).toBe(false);
    expect(surveyReadiness(d, [{ ...blurry, notes: "Fog; best possible" }]).ready).toBe(true);
  });
});

describe("payload", () => {
  it("keeps the legacy roof fields SolarPro reads, with numeric azimuth", () => {
    const d = doc();
    d.planes[0].answers = { azimuth: 180, material: "Asphalt shingle", pitch: "6/12" };
    d.answers.rafter_size = "2x6";
    d.answers.rafter_spacing = "24in";
    expect(legacyMetadata(d)).toMatchObject({
      type: "roof_mount",
      azimuth: 180,
      roof_material: "Asphalt shingle",
      rafter_size: "2x6",
      rafter_spacing: "24in",
    });
  });

  it("builds the server payload with SolarPro links, v2 doc and one checklist row per step", () => {
    const d = doc();
    d.project.handoff = { solarproUserId: "u1", solarproEmail: "a@b.co" };
    const p = buildSurveyPayload({ id: "s1", doc: d, photos: [], deviceId: "dev", createdAt: "x" });
    expect(p).toMatchObject({
      project_name: "Smith",
      site_address: "1 Main St",
      category_id: "roof_mount",
      solarpro_project_id: "p1",
      solarpro_org_id: "c1",
      solarpro_user_id: "u1",
      solarpro_email: "a@b.co",
      status: "submitted",
    });
    expect((p.metadata.survey_v2 as { version: number }).version).toBe(2);
    expect(p.checklist.map((c) => c.label)).toEqual([
      "1. Project Arrival",
      "2. Site Walkaround",
      "3. Utility Service",
      "4. Electrical Equipment",
      "5. Roof & Array",
    ]);
    expect(p.checklist[0].notes).toContain("Site address: 1 Main St");
  });

  it("writes the full Golden Block per photo", () => {
    const d = doc();
    const ph = photo("roof_pitch", "A", { retakeReason: "Glare" });
    expect(goldenBlock(ph, d)).toMatchObject({
      projectId: "p1",
      surveyId: "s1",
      stepId: "roof_array",
      sectionId: "roof_plane",
      photoSlotId: "roof_pitch",
      planeId: "A",
      evidenceCategory: "roof_array",
      isRequired: true,
      heading: 180,
      retakeReason: "Glare",
      solarProRequirementId: "ROOF-PITCH",
      solarProUsageMapping: ["CAD Layout", "Structural Engineering"],
    });
    expect(photoLabel(ph)).toBe("Roof & Array · Plane A · Pitch gauge");
  });
});

describe("blur check", () => {
  function checker(w: number, h: number, cell: number): Uint8Array {
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 230 : 25;
        const i = (y * w + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
        rgba[i + 3] = 255;
      }
    }
    return rgba;
  }

  function boxBlur(rgba: Uint8Array, w: number, h: number, r: number): Uint8Array {
    const out = new Uint8Array(rgba.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            s += rgba[(yy * w + xx) * 4];
            n++;
          }
        }
        const i = (y * w + x) * 4;
        out[i] = out[i + 1] = out[i + 2] = s / n;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  function toB64(rgba: Uint8Array, w: number, h: number): string {
    const jpg = encodeJpeg({ data: rgba, width: w, height: h }, 90).data;
    return Buffer.from(jpg).toString("base64");
  }

  it("decodes base64 like Buffer does", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
    expect(Array.from(base64ToBytes(Buffer.from(bytes).toString("base64")))).toEqual(Array.from(bytes));
  });

  it("scores a flat image as zero", () => {
    expect(laplacianVariance(new Uint8Array(100).fill(128), 10, 10)).toBe(0);
  });

  it("separates a sharp scene from the same scene blurred", () => {
    const w = 240;
    const h = 180;
    const sharp = checker(w, h, 12);
    const blurred = boxBlur(sharp, w, h, 10);
    const sharpScore = sharpnessFromJpegBase64(toB64(sharp, w, h));
    const blurScore = sharpnessFromJpegBase64(toB64(blurred, w, h));
    expect(sharpScore).toBeGreaterThan(BLUR_THRESHOLD);
    expect(blurScore).toBeLessThan(BLUR_THRESHOLD);
    expect(isBlurry(blurScore)).toBe(true);
    expect(isBlurry(sharpScore)).toBe(false);
    expect(isBlurry(null)).toBe(false);
  });
});
