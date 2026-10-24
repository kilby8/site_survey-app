import type { AnswerValue } from "../blueprint";
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///doc/", cacheDirectory: "file:///cache/" }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg" } }));
jest.mock("expo-print", () => ({ printToFileAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock("../../database/surveyDb", () => ({ getDb: () => ({}) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));

import type { ServerInstallJob } from "../../api/client";
import { ALL_STEPS, findSlot, STEPS, stepsFor } from "../blueprint";
import { INSTALL_STEPS, INSTALL_V2_STEPS } from "../installBlueprint";
import {
  crewPhotos,
  dirtyAnswerKeys,
  getCrewPhotos,
  installJobId,
  loadCrewPhotos,
  markAnswerDirty,
  mergeServerAnswers,
  queueCrewDelete,
  syncInstallJob,
  type InstallSyncDeps,
} from "../installJob";
import { installReportHtml, isReadableSlot } from "../installReport";
import { newInstallDoc, type CapturedPhoto } from "../model";
import { sectionInstances, surveyReadiness } from "../progress";
import type { StoredSurvey } from "../repo";

const project = { solarproProjectId: "p-123", solarproClientId: "c-1", projectName: "Andrew Lindsey", clientName: "Andrew Lindsey" };

/** A job started on the first install checklist (the tests below were written for it). */
function doc() {
  const d = newInstallDoc({ installType: "roof_mount", project, inspectorName: "James Carpenter", siteAddress: "27 Oak Ct, Peru IL" });
  delete d.installChecklist;
  return d;
}

/** A job started now: per-job-type checklists. */
function v2Doc(answers: Record<string, AnswerValue> = {}) {
  const d = newInstallDoc({ installType: "roof_mount", project, inspectorName: "James Carpenter", siteAddress: "27 Oak Ct, Peru IL" });
  d.answers = { ...d.answers, ...answers };
  return d;
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

describe("install checklist v2 — per job type (CompanyCam UTS templates, 2026-10-22)", () => {
  const items = (d: ReturnType<typeof v2Doc>) =>
    stepsFor(d).flatMap((st) => sectionInstances(d, st).flatMap((i) => i.slots));

  it("new jobs get it; jobs started on the first checklist keep theirs", () => {
    expect(stepsFor(v2Doc())).toBe(INSTALL_V2_STEPS);
    expect(stepsFor(doc())).toBe(INSTALL_STEPS);
  });

  it("shows only the job-type question until someone picks one", () => {
    const d = v2Doc();
    expect(items(d)).toEqual([]);
    expect(surveyReadiness(d, []).missing.map((m) => m.key)).toContain("field:job_type");
  });

  it("Solar only matches the template: 40 items, 31 photo-required, no battery items", () => {
    const list = items(v2Doc({ job_type: "Solar only", equipment_brand: "Enphase" }));
    // The Tesla-only MCI item is one of the 40; count it with Tesla picked.
    const tesla = items(v2Doc({ job_type: "Solar only", equipment_brand: "Tesla" }));
    expect(tesla.length).toBe(40);
    expect(tesla.filter((s) => s.required).length).toBe(31);
    expect(list.some((s) => s.id.startsWith("uts_battery"))).toBe(false);
    expect(list.some((s) => s.id === "uts_subpanel")).toBe(true);
  });

  it("Solar + Battery adds the battery section and reserve check: 37 photo-required", () => {
    const list = items(v2Doc({ job_type: "Solar + Battery", equipment_brand: "Enphase" }));
    expect(list.filter((s) => s.required).length).toBe(37);
    expect(list.some((s) => s.id === "uts_battery_reserve")).toBe(true);
    expect(list.some((s) => s.id === "uts_subpanel")).toBe(false);
    expect(list.some((s) => s.id === "uts_5p_cts")).toBe(true);
    expect(list.some((s) => s.id === "uts_tesla_rem")).toBe(false);
  });

  it("offers only the job types that have a checklist, so nobody opens an empty one", () => {
    const field = INSTALL_V2_STEPS[0].sections[0].fields.find((f) => f.id === "job_type")!;
    expect(field.options).toEqual(["Solar only", "Solar + Battery", "Solrite – Solar + Battery", "Solrite – Battery only", "Solar R&R", "Service call"]);
  });

  it("Solrite Solar + Battery matches its template: 42 items on load-side backup, 40 required (shading + E-STOP are IF)", () => {
    const list = items(v2Doc({ job_type: "Solrite – Solar + Battery", backup_type: "Partial home (load side)" }));
    expect(list.length).toBe(42);
    expect(list.filter((s) => s.required).length).toBe(40);
    expect(list.every((s) => s.id.startsWith("sr_"))).toBe(true);
    expect(list.some((s) => s.id === "sr_racking")).toBe(true);
    expect(list.some((s) => s.id === "sr_dead_front_batt")).toBe(false);
    // Whole-home backup drops the two protected-load-panel photos.
    const whole = items(v2Doc({ job_type: "Solrite – Solar + Battery", backup_type: "Whole home (supply side)" }));
    expect(whole.length).toBe(40);
  });

  it("Solrite Battery only matches its template: no roof, 30 required, G-N bond check, existing array only if there's PV", () => {
    const base = { job_type: "Solrite – Battery only", backup_type: "Partial home (load side)" };
    const noPv = items(v2Doc({ ...base, sr_has_pv: false }));
    expect(noPv.length).toBe(30);
    expect(noPv.filter((s) => s.required).length).toBe(30);
    expect(noPv.some((s) => s.id === "sr_racking" || s.id === "sr_pv_combiner" || s.id === "sr_cts")).toBe(false);
    expect(noPv.some((s) => s.id === "sr_dead_front_batt" && /NO ground-neutral/.test(s.hint))).toBe(true);
    const withPv = items(v2Doc({ ...base, sr_has_pv: true }));
    expect(withPv.length).toBe(31);
    expect(withPv.find((s) => s.id === "sr_existing_array")?.required).toBe(false);
  });

  it("Solrite jobs ask for the backup type, not the Enphase/Tesla brand; network photos are in Final", () => {
    const d = v2Doc({ job_type: "Solrite – Battery only" });
    const keys = surveyReadiness(d, []).missing.map((m) => m.key);
    expect(keys).toContain("field:backup_type");
    expect(keys).not.toContain("field:equipment_brand");
    const final = INSTALL_V2_STEPS[1];
    expect(sectionInstances(d, final).flatMap((i) => i.slots).map((s) => s.id)).toEqual(["sr_net_setup", "sr_net_host", "sr_net_client", "sr_net_stickers"]);
  });

  it("Solar R&R matches its template: 36 items, 33 required, closeout in Final", () => {
    const d = v2Doc({ job_type: "Solar R&R" });
    const list = items(d);
    expect(list.length).toBe(36);
    expect(list.filter((s) => s.required).length).toBe(33);
    expect(list.every((s) => s.id.startsWith("rr_"))).toBe(true);
    expect(sectionInstances(d, INSTALL_V2_STEPS[1]).flatMap((i) => i.slots).length).toBe(6);
    expect(surveyReadiness(d, []).missing.map((m) => m.key)).not.toContain("field:equipment_brand");
  });

  it("Service call matches its template: 24 items, 15 required", () => {
    const list = items(v2Doc({ job_type: "Service call" }));
    expect(list.length).toBe(24);
    expect(list.filter((s) => s.required).length).toBe(15);
    expect(list.every((s) => s.id.startsWith("svc_"))).toBe(true);
  });

  it("every slot id is unique across the v2 checklist", () => {
    const ids = INSTALL_V2_STEPS.flatMap((st) => st.sections.flatMap((sec) => sec.slots.map((s) => s.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every item cites its LightReach / Solrite / IL / AHJ source, and IF items are never required", () => {
    for (const s of INSTALL_V2_STEPS.flatMap((st) => st.sections.flatMap((sec) => sec.slots))) {
      expect(s.requirementId).toMatch(/LR|SR|IL|AHJ|UTS RR|UTS SVC/);
      expect(s.hint).toContain(`[${s.requirementId}]`);
      if (s.label.startsWith("IF")) expect(s.required).toBe(false);
    }
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

  it("keeps going past a photo that won't upload, and says so", async () => {
    const survey = { id: installJobId("p-123"), doc: doc(), currentStep: "install_day" } as unknown as StoredSurvey;
    const { d, calls } = deps({
      loadPhotos: async () => [photo("bad", "inst_feet"), photo("good", "inst_seal")],
      uploadPhoto: async (_id, p) => {
        if (p.clientId === "bad") throw new Error("413 too large");
        calls.push(`upload:${p.clientId}`);
        return { id: `srv-${p.clientId}` };
      },
    });
    const res = await syncInstallJob(survey, d);
    expect(calls).toContain("upload:good");
    expect(calls).toContain("uploaded:good");
    expect(res.failed).toBe(1);
    expect(res.error).toMatch(/1 photo couldn't sync \(413 too large\)/);
  });

  it("a delete the server refuses stays queued and doesn't stop uploads; a sign-out stops the pass", async () => {
    const survey = { id: installJobId("p-321"), doc: doc(), currentStep: "install_day" } as unknown as StoredSurvey;
    await queueCrewDelete(survey.id, "gone-1");
    const { d, calls } = deps({
      loadPhotos: async () => [photo("a", "inst_feet")],
      deletePhoto: async () => {
        throw new Error("500");
      },
    });
    const res = await syncInstallJob(survey, d);
    expect(calls).toContain("uploaded:a");
    expect(res.failed).toBe(1);

    const { SessionExpiredError } = jest.requireActual("../../api/session");
    const { d: d2 } = deps({
      loadPhotos: async () => [photo("b", "inst_seal")],
      deletePhoto: async () => ({ deleted: 1 }),
      uploadPhoto: async () => {
        throw new SessionExpiredError();
      },
    });
    await expect(syncInstallJob(survey, d2)).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("keeps an answer typed while the sync was on the network", async () => {
    let d0 = doc();
    d0 = markAnswerDirty({ ...d0, answers: { ...d0.answers, tilt_deg: 33.7 } }, "tilt_deg");
    const survey = { id: installJobId("p-123"), doc: d0, currentStep: "install_day" } as unknown as StoredSurvey;
    // While the patch was in flight the user changed tilt again and typed a cantilever.
    let typed = markAnswerDirty({ ...d0, answers: { ...d0.answers, tilt_deg: 34, max_cantilever_in: 11 } }, "max_cantilever_in");
    typed = markAnswerDirty(typed, "tilt_deg");
    let saved: ReturnType<typeof doc> | null = null;
    const { d } = deps({
      loadPhotos: async () => [],
      loadDoc: async () => typed,
      saveDoc: async (_id, x) => {
        saved = x;
      },
    });
    await syncInstallJob(survey, d);
    expect(saved!.answers.tilt_deg).toBe(34);
    expect(saved!.answers.max_cantilever_in).toBe(11);
    expect(saved!.answers.commissioned).toBe(true);
    expect(dirtyAnswerKeys(saved!).sort()).toEqual(["max_cantilever_in", "tilt_deg"]);
  });

  it("shows a phase another phone already sent", async () => {
    const survey = { id: installJobId("p-123"), doc: doc(), currentStep: "install_day" } as unknown as StoredSurvey;
    let saved: ReturnType<typeof doc> | null = null;
    const { d } = deps({
      loadPhotos: async () => [],
      putJob: async () => ({ ...serverJob([]), metadata: { answers: {}, finished: { install_day: "2026-09-11T20:00:00Z" } } }),
      saveDoc: async (_id, x) => {
        saved = x;
      },
    });
    await syncInstallJob(survey, d);
    expect((saved!.extra.finished as Record<string, string>).install_day).toBe("2026-09-11T20:00:00Z");
  });

  it("remembers the crew's photos across an app restart", async () => {
    const survey = { id: installJobId("p-777"), doc: doc(), currentStep: "install_day" } as unknown as StoredSurvey;
    const { d } = deps({ loadPhotos: async () => [] });
    await syncInstallJob(survey, d);
    await new Promise((r) => setTimeout(r, 0));
    // Saved on the phone, not just held in memory.
    const AsyncStorage = jest.requireMock("@react-native-async-storage/async-storage");
    const saved = JSON.parse(await AsyncStorage.getItem(`site-survey.install-crew.${survey.id}`));
    expect(saved.map((p: { id: string }) => p.id)).toEqual(["ray-1"]);
    expect((await loadCrewPhotos(survey.id)).map((p) => p.id)).toEqual(["ray-1"]);
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

  it("prints labels and screens whole so the text can be read", () => {
    expect(isReadableSlot("inst_sticker_map")).toBe(true);
    expect(isReadableSlot("fin_placard")).toBe(true);
    expect(isReadableSlot("fin_labels_disc")).toBe(true);
    expect(isReadableSlot("inst_feet")).toBe(false);
    expect(isReadableSlot("fin_cantilever")).toBe(true);
    expect(isReadableSlot("inst_breaker")).toBe(true);
  });
});
