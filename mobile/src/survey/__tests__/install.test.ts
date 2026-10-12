jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///doc/", cacheDirectory: "file:///cache/" }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg" } }));
jest.mock("expo-print", () => ({ printToFileAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("../../database/surveyDb", () => ({ getDb: () => ({}) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));

import type { ServerInstallJob } from "../../api/client";
import { ALL_STEPS, findSlot, STEPS, stepsFor } from "../blueprint";
import { INSTALL_STEPS } from "../installBlueprint";
import {
  crewPhotos,
  dirtyAnswerKeys,
  getCrewPhotos,
  installJobId,
  markAnswerDirty,
  mergeServerAnswers,
  queueCrewDelete,
  syncInstallJob,
  type InstallSyncDeps,
} from "../installJob";
import { installReportHtml } from "../installReport";
import { newInstallDoc, type CapturedPhoto } from "../model";
import { surveyReadiness } from "../progress";
import type { StoredSurvey } from "../repo";

const project = { solarproProjectId: "p-123", solarproClientId: "c-1", projectName: "Andrew Lindsey", clientName: "Andrew Lindsey" };

function doc() {
  return newInstallDoc({ installType: "roof_mount", project, inspectorName: "James Carpenter", siteAddress: "27 Oak Ct, Peru IL" });
}

function photo(id: string, slotId: string, extra: Partial<CapturedPhoto> = {}): CapturedPhoto {
  const f = findSlot(slotId)!;
  return {
    id,
    surveyId: installJobId("p-123"),
    relPath: `survey-photos-v2/${id}.jpg`,
    annotatedRelPath: null,
    mimeType: "image/jpeg",
    stepId: f.step.id,
    sectionId: f.section.id,
    slotId,
    planeId: null,
    required: f.slot.required,
    captureOrder: 1,
    capturedAt: "2026-09-21T13:40:00.000Z",
    gps: { lat: 41.4, lng: -89.1, alt: null },
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

describe("install job id", () => {
  it("matches the server (and RFC 4122 UUIDv5) so every crew phone lands on one job", () => {
    // Same values the backend's installJobId and Python's uuid.uuid5 give.
    expect(installJobId("p-123")).toBe("cdb762ac-21a1-5e51-b766-41a102728e6a");
    expect(installJobId("Lindsey ✓ 42")).toBe("afa990a8-4b3c-557b-81d7-11559bf2b3e1");
  });
});

describe("install blueprint", () => {
  it("has slot ids unique across surveys and install jobs", () => {
    const ids = ALL_STEPS.flatMap((s) => s.sections.flatMap((sec) => sec.slots.map((sl) => sl.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every kind of shot in the crew's CompanyCam final report", () => {
    const labels = INSTALL_STEPS.flatMap((s) => s.sections.flatMap((sec) => sec.slots.map((sl) => sl.label.toLowerCase())));
    for (const need of ["feet", "sealant", "bonding", "sticker map", "j-box", "conduit", "disconnect", "cts", "placard", "inclinometer", "cantilever", "under-panel", "production", "commissioning", "compliance"]) {
      expect(labels.some((l) => l.includes(need))).toBe(true);
    }
  });

  it("picks the install steps for install jobs only", () => {
    expect(stepsFor(doc()).map((s) => s.id)).toEqual(["install_day", "final_inspection"]);
    expect(stepsFor({}).map((s) => s.id)).toEqual(STEPS.map((s) => s.id));
  });

  it("counts crew photos toward completeness", () => {
    const d = doc();
    const before = surveyReadiness(d, []).missing.length;
    const after = surveyReadiness(d, [photo("cody-1", "inst_feet", { crew: { creatorName: "Cody Arnold", creatorEmail: null } })]).missing.length;
    expect(after).toBe(before - 1);
  });
});

describe("answers across phones", () => {
  it("keeps this phone's unsent changes and takes the crew's for the rest", () => {
    let d = doc();
    d = markAnswerDirty({ ...d, answers: { ...d.answers, tilt_deg: 33.7 } }, "tilt_deg");
    expect(dirtyAnswerKeys(d)).toEqual(["tilt_deg"]);
    const merged = mergeServerAnswers(d, { tilt_deg: 30, cell_modem: true });
    expect(merged.answers.tilt_deg).toBe(33.7);
    expect(merged.answers.cell_modem).toBe(true);
  });
});

function serverJob(photos: ServerInstallJob["photos"], answers: Record<string, unknown> = {}): ServerInstallJob {
  return { id: installJobId("p-123"), kind: "install", project_name: "Andrew Lindsey", metadata: { answers }, photos };
}

describe("crew photos", () => {
  it("shows other phones' slot photos with who took them, skipping this phone's own and markup copies", () => {
    const job = serverJob([
      { id: "s1", client_photo_id: "mine-1", label: "", captured_at: null, meta: { photoSlotId: "inst_feet" } },
      { id: "s2", client_photo_id: "cody-1", label: "", captured_at: null, meta: { photoSlotId: "inst_cts", creatorName: "Cody Arnold", timestamp: "2026-09-11T17:06:00Z" } },
      { id: "s3", client_photo_id: "cody-1-m1", label: "", captured_at: null, meta: { photoSlotId: "inst_cts", markupOf: "cody-1" } },
      { id: "s4", client_photo_id: "x", label: "", captured_at: null, meta: { photoSlotId: "not_a_slot" } },
    ]);
    const out = crewPhotos(job, new Set(["mine-1"]), (p) => `https://api/x/${p.id}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "cody-1", slotId: "inst_cts", relPath: "https://api/x/s2", annotatedRelPath: "https://api/x/s3" });
    expect(out[0].crew?.creatorName).toBe("Cody Arnold");
  });
});

describe("syncInstallJob", () => {
  function deps(over: Partial<InstallSyncDeps> = {}) {
    const calls: string[] = [];
    const server = serverJob(
      [{ id: "s9", client_photo_id: "ray-1", label: "", captured_at: null, meta: { photoSlotId: "fin_placard", creatorName: "Raymond O'Brian" } }],
      { commissioned: true },
    );
    const d: InstallSyncDeps = {
      loadPhotos: async () => [photo("a", "inst_feet"), photo("b", "inst_seal", { uploadState: "uploaded", serverPhotoId: "s-b" })],
      saveDoc: async (_id, doc) => {
        calls.push(`save:${JSON.stringify(doc.answers)}`);
      },
      putJob: async () => {
        calls.push("put");
        return server;
      },
      patchAnswers: async (_id, a) => {
        calls.push(`patch:${JSON.stringify(a)}`);
        return { answers: { ...server.metadata!.answers, ...a } };
      },
      deletePhoto: async (_id, cid) => {
        calls.push(`delete:${cid}`);
        return { deleted: 1 };
      },
      uploadPhoto: async (_id, p) => {
        calls.push(`upload:${p.clientId}:${String(p.meta.creatorName)}`);
        return { id: `srv-${p.clientId}` };
      },
      markPhotoUploaded: async (id) => {
        calls.push(`uploaded:${id}`);
      },
      fileExists: async () => true,
      fileUri: (r) => `file:///doc/${r}`,
      photoUrl: (p) => `https://api/photos/${p.id}`,
      me: { name: "James Carpenter", email: "james@example.com" },
      ...over,
    };
    return { d, calls };
  }

  it("sends changed answers, deletes, and new photos with the creator, then shows the crew's photos", async () => {
    let d0 = doc();
    d0 = markAnswerDirty({ ...d0, answers: { ...d0.answers, tilt_deg: 33.7 } }, "tilt_deg");
    const survey = { id: installJobId("p-123"), doc: d0, currentStep: "install_day" } as unknown as StoredSurvey;
    await queueCrewDelete(survey.id, "old-1");
    const { d, calls } = deps();
    const res = await syncInstallJob(survey, d);
    expect(res).toEqual({ uploaded: 1, crew: 1 });
    expect(calls).toEqual([
      "put",
      'patch:{"tilt_deg":33.7}',
      'save:{"site_address":"27 Oak Ct, Peru IL","tilt_deg":33.7,"commissioned":true}',
      "delete:old-1",
      "upload:a:James Carpenter",
      "uploaded:a",
      "put",
    ]);
    expect(getCrewPhotos(survey.id).map((p) => p.id)).toEqual(["ray-1"]);
  });

  it("re-sends only metadata for an uploaded photo whose note changed", async () => {
    const survey = { id: installJobId("p-123"), doc: doc(), currentStep: "install_day" } as unknown as StoredSurvey;
    const { d, calls } = deps({
      loadPhotos: async () => [photo("b", "inst_seal", { serverPhotoId: "s-b", notes: "Butyl under every foot" })],
      updateMeta: async (_j, cid, _l, meta) => {
        calls.push(`meta:${cid}:${String(meta.notes)}`);
        return { id: "s-b" };
      },
    });
    await syncInstallJob(survey, d);
    expect(calls).toContain("meta:b:Butyl under every foot");
    expect(calls.some((c) => c.startsWith("upload:"))).toBe(false);
  });
});

describe("install report", () => {
  it("has a cover, a checklist with done / skipped / missing, and captioned photos with who took them", () => {
    const d = { ...doc(), overrides: [{ key: "inst_jbox", reason: "Ground mount — no roof box", at: "2026-09-11T00:00:00Z" }] };
    d.answers.tilt_deg = 33.7;
    const photos = [
      photo("a", "fin_cantilever", { notes: 'Cantilever 9"' }),
      photo("b", "fin_cantilever", { crew: { creatorName: "Cody Arnold", creatorEmail: null } }),
    ];
    const html = installReportHtml(d, photos, { a: "data:image/jpeg;base64,AAA", b: null }, { companyName: "Under The Sun Solar" });
    expect(html).toContain("Andrew Lindsey");
    expect(html).toContain("Under The Sun Solar");
    expect(html).toContain("Checklist");
    expect(html).toContain("✓ 2 photos");
    expect(html).toContain("Skipped — Ground mount — no roof box");
    expect(html).toContain("Missing");
    expect(html).toContain("33.7 °");
    expect(html).toContain("Rail cantilevers (1)");
    expect(html).toContain("Cantilever 9&quot;");
    expect(html).toContain("Cody Arnold");
    expect(html).toContain("Photo not available offline");
  });
});
