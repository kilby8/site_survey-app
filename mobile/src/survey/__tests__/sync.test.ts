import { SessionExpiredError } from "../../api/session";
import { findSlot } from "../blueprint";
import { newSurveyDoc, type CapturedPhoto } from "../model";
import type { StoredSurvey } from "../repo";
import { BACKOFF_MINUTES, nextRetryAt, syncSurveyV2, WAIT_FOR_LOGIN, type SyncDeps } from "../sync";

jest.mock("expo-secure-store", () => ({}));
jest.mock("@react-native-async-storage/async-storage", () => ({}));

function survey(attempts = 0): StoredSurvey {
  return {
    id: "s1",
    doc: newSurveyDoc({
      installType: "roof_mount",
      project: { solarproProjectId: "p1", solarproClientId: null, projectName: "Job", clientName: null },
      inspectorName: "Tech",
    }),
    currentStep: "review",
    status: "submitted",
    syncStatus: "pending",
    syncError: null,
    syncAttempts: attempts,
    nextRetryAt: null,
    serverPosted: false,
    ownerEmail: "tech@x.co",
    deviceId: "dev",
    submittedAt: "t",
    createdAt: "t",
    updatedAt: "t",
  };
}

function photo(id: string, extra: Partial<CapturedPhoto> = {}): CapturedPhoto {
  const f = findSlot("arrival_front")!;
  return {
    id, surveyId: "s1", relPath: `survey-photos-v2/${id}.jpg`, annotatedRelPath: null, mimeType: "image/jpeg",
    stepId: f.step.id, sectionId: f.section.id, slotId: "arrival_front", planeId: null, required: true,
    captureOrder: 1, capturedAt: "2026-10-11T12:00:00.000Z", gps: null, heading: null, notes: "",
    retakeReason: null, qualityStatus: "accepted", blurScore: 100, uploadState: "local", serverPhotoId: null,
    ...extra,
  };
}

function deps(photos: CapturedPhoto[], over: Partial<SyncDeps> = {}) {
  const calls: string[] = [];
  const uploaded: string[] = [];
  const d: SyncDeps = {
    loadPhotos: async () => photos,
    fileExists: async () => true,
    fileUri: (r) => `file:///docs/${r}`,
    postSurvey: async () => { calls.push("post"); return {}; },
    uploadPhoto: async (_s, p) => { calls.push(`upload:${p.clientId}`); return { id: `srv-${p.clientId}` }; },
    complete: async () => { calls.push("complete"); return {}; },
    markSyncing: async () => { calls.push("syncing"); return true; },
    stillSubmitted: async () => true,
    markPhotoUploaded: async (id) => { uploaded.push(id); },
    markSynced: async () => { calls.push("synced"); },
    markSyncError: async (_id, msg, attempts, next) => { calls.push(`error:${attempts}:${next ? "retry" : "none"}:${msg}`); },
    isSessionExpired: (e): e is SessionExpiredError => e instanceof SessionExpiredError,
    now: () => new Date("2026-10-11T12:00:00.000Z"),
    ...over,
  };
  return { d, calls, uploaded };
}

describe("syncSurveyV2", () => {
  it("posts, uploads only what is left, then completes", async () => {
    const { d, calls, uploaded } = deps([photo("a", { uploadState: "uploaded" }), photo("b"), photo("c")]);
    await expect(syncSurveyV2(survey(), d)).resolves.toBe("synced");
    expect(calls).toEqual(["syncing", "post", "upload:b", "upload:c", "complete", "synced"]);
    expect(uploaded).toEqual(["b", "c"]);
  });

  it("sends only the metadata for an uploaded photo whose note changed", async () => {
    const edited = photo("a", { serverPhotoId: "srv-a", notes: "Seal broken" });
    const { d, calls, uploaded } = deps([edited], {
      updatePhotoMeta: async (_s, clientId, _l, meta) => {
        calls.push(`meta:${clientId}:${String(meta.notes)}`);
        return { id: "srv-a" };
      },
    });
    await expect(syncSurveyV2(survey(), d)).resolves.toBe("synced");
    expect(calls).toEqual(["syncing", "post", "meta:a:Seal broken", "complete", "synced"]);
    expect(uploaded).toEqual(["a"]);
  });

  it("falls back to a full upload when the server doesn't have the photo", async () => {
    const { d, calls } = deps([photo("a", { serverPhotoId: "srv-a" })], {
      updatePhotoMeta: async (_s, clientId) => {
        calls.push(`meta:${clientId}`);
        return null;
      },
    });
    await expect(syncSurveyV2(survey(), d)).resolves.toBe("synced");
    expect(calls).toEqual(["syncing", "post", "meta:a", "upload:a", "complete", "synced"]);
  });

  it("uploads a marked-up copy as its own photo", async () => {
    const { d, calls } = deps([photo("a", { annotatedRelPath: "survey-photos-v2/a-markup-1.jpg" })]);
    await syncSurveyV2(survey(), d);
    expect(calls).toContain("upload:a");
    expect(calls).toContain("upload:a-markup-1");
  });

  it("keeps progress when an upload fails midway and schedules a retry", async () => {
    let n = 0;
    const { d, calls, uploaded } = deps([photo("a"), photo("b")], {
      uploadPhoto: async (_s, p) => {
        n++;
        if (n === 2) throw new Error("Network request failed");
        return { id: `srv-${p.clientId}` };
      },
    });
    await expect(syncSurveyV2(survey(2), d)).resolves.toBe("error");
    expect(uploaded).toEqual(["a"]);
    expect(calls[calls.length - 1]).toBe("error:3:retry:No connection to the server. Will retry automatically.");
  });

  it("does not complete when a photo file is missing, and says which", async () => {
    const { d, calls } = deps([photo("a")], { fileExists: async () => false });
    await syncSurveyV2(survey(), d);
    expect(calls).not.toContain("complete");
    expect(calls[calls.length - 1]).toContain("Photo file missing on this phone: Arrival · Front of home");
  });

  it("stops and asks for sign-in when the session has expired", async () => {
    const { d, calls } = deps([photo("a")], {
      postSurvey: async () => { throw new SessionExpiredError(); },
    });
    await expect(syncSurveyV2(survey(1), d)).resolves.toBe("needs_login");
    expect(calls[calls.length - 1]).toBe("error:1:retry:Sign in again to finish uploading.");
  });

  it("parks a sign-in failure until sign-in instead of retrying on a timer", async () => {
    let next: string | null = "unset";
    const { d } = deps([photo("a")], {
      postSurvey: async () => { throw new SessionExpiredError(); },
      markSyncError: async (_i, _m, _a, n) => { next = n; },
    });
    await syncSurveyV2(survey(), d);
    expect(next).toBe(WAIT_FOR_LOGIN);
  });

  it("does nothing if another pass already claimed it or it was reopened", async () => {
    const { d, calls } = deps([photo("a")], { markSyncing: async () => false });
    await expect(syncSurveyV2(survey(), d)).resolves.toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("stops without completing when reopened mid-upload", async () => {
    let n = 0;
    const { d, calls } = deps([photo("a"), photo("b")], { stillSubmitted: async () => ++n < 2 });
    await expect(syncSurveyV2(survey(), d)).resolves.toBe("skipped");
    expect(calls).toContain("upload:a");
    expect(calls).not.toContain("upload:b");
    expect(calls).not.toContain("complete");
    expect(calls.some((c) => c.startsWith("error"))).toBe(false);
  });

  it("doesn't send photos for items that are now hidden or rejected", async () => {
    const hidden = { ...photo("h"), slotId: "elec_sub_panel", stepId: "electrical_equipment" as const, sectionId: "sub_panel" };
    const { d, calls } = deps([photo("a"), photo("r", { qualityStatus: "rejected" }), hidden]);
    await syncSurveyV2(survey(), d);
    expect(calls.filter((c) => c.startsWith("upload:"))).toEqual(["upload:a"]);
  });

  it("tells the server which photos the survey has now", async () => {
    let payload: { client_photo_ids?: string[] } = {};
    const { d } = deps([photo("a", { annotatedRelPath: "survey-photos-v2/a-markup-9.jpg" }), photo("b")], {
      postSurvey: async (p) => { payload = p as typeof payload; return {}; },
    });
    await syncSurveyV2(survey(), d);
    expect(payload.client_photo_ids).toEqual(["a", "a-markup-9", "b"]);
  });

  it("backs off 1, 2, 5, 15, then 30 minutes", () => {
    const now = new Date("2026-10-11T12:00:00.000Z");
    const mins = [1, 2, 3, 4, 5, 9].map((a) => (Date.parse(nextRetryAt(a, now)) - now.getTime()) / 60_000);
    expect(mins).toEqual([...BACKOFF_MINUTES, 30]);
  });
});
