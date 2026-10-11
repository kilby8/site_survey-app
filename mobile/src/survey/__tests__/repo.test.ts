const mockRunAsync = jest.fn().mockResolvedValue(undefined);
const mockGetFirstAsync = jest.fn();
jest.mock("../../database/surveyDb", () => ({ getDb: () => ({ runAsync: mockRunAsync, getFirstAsync: mockGetFirstAsync }) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///doc/", deleteAsync: jest.fn() }));

import { markPhotoUploaded, updatePhoto } from "../repo";
import type { CapturedPhoto } from "../model";

const current = { notes: "Meter behind gate", quality_status: "accepted", retake_reason: null };

describe("updatePhoto re-send", () => {
  beforeEach(() => {
    mockRunAsync.mockClear();
    mockGetFirstAsync.mockReset().mockResolvedValue(current);
  });
  const sql = () => mockRunAsync.mock.calls[0][0] as string;

  it("re-sends an uploaded photo when its note changes", async () => {
    await updatePhoto("p1", { notes: "Meter on the left wall" });
    expect(sql()).toContain("upload_state = 'local'");
  });

  it("doesn't re-send when the note is saved unchanged (autosave on leaving)", async () => {
    await updatePhoto("p1", { notes: "Meter behind gate" });
    expect(sql()).not.toContain("upload_state");
  });

  it("re-sends when a flagged photo is kept with a reason", async () => {
    await updatePhoto("p1", { qualityStatus: "pending_review", notes: "Only angle possible" });
    expect(sql()).toContain("upload_state = 'local'");
  });
});

describe("markPhotoUploaded", () => {
  beforeEach(() => mockRunAsync.mockClear());

  it("only marks uploaded if the photo still matches what was sent", async () => {
    const sent = { notes: "", qualityStatus: "accepted", retakeReason: null, annotatedRelPath: null } as unknown as CapturedPhoto;
    await markPhotoUploaded("p1", "srv-1", sent);
    const [sql, args] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    // Conditional on the sent note/status/reason/markup: an edit made while the
    // upload was in flight leaves the row pending instead of being lost.
    expect(sql).toMatch(/WHERE id = \?\s+AND COALESCE\(notes, ''\) = \?/);
    expect(args).toEqual(["srv-1", "p1", "", "accepted", null, null]);
  });
});
