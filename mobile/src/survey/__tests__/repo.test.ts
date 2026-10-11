const mockRunAsync = jest.fn().mockResolvedValue(undefined);
const mockGetFirstAsync = jest.fn();
jest.mock("../../database/surveyDb", () => ({ getDb: () => ({ runAsync: mockRunAsync, getFirstAsync: mockGetFirstAsync }) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid" }));
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: "file:///doc/", deleteAsync: jest.fn() }));

import { updatePhoto } from "../repo";

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
