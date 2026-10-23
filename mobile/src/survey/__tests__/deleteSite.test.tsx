import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert, Keyboard } from "react-native";
import { useKeyboardHeight } from "../../ui/useKeyboardHeight";
import { deletePrompt } from "../deleteSite";
import type { SurveySummary } from "../repo";

const row = (over: Partial<SurveySummary> = {}): SurveySummary => ({
  id: "s1", title: "Kay Hinnen", address: "12 Elm St", installType: "roof_mount", status: "draft", syncStatus: "local",
  syncError: null, nextRetryAt: null, currentStep: "project_arrival", photoCount: 0, uploadedCount: 0,
  updatedAt: new Date().toISOString(), ownerEmail: null, legacy: false, kind: "survey", ...over,
});

describe("deletePrompt", () => {
  it("drafts are deleted from the phone", () => {
    expect(deletePrompt(row())).toMatchObject({ allowed: true, button: "Delete", title: "Delete this survey?" });
  });
  it("uploaded surveys are removed from the phone and stay in SolarPro", () => {
    const p = deletePrompt(row({ status: "submitted", syncStatus: "synced", photoCount: 4, uploadedCount: 4 }));
    expect(p).toMatchObject({ allowed: true, button: "Remove" });
    expect(p.message).toMatch(/stays in SolarPro/);
  });
  it("install jobs say how many photos haven't been sent", () => {
    const p = deletePrompt(row({ kind: "install", photoCount: 5, uploadedCount: 3 }));
    expect(p.message).toMatch(/2 photos haven't been sent yet and will be lost/);
  });
  it("not yet uploaded surveys warn they'll be gone for good", () => {
    expect(deletePrompt(row({ status: "submitted", syncStatus: "error", photoCount: 1 })).message).toMatch(/gone for good.*1 photo hasn't/);
  });
  it("won't delete while it's uploading", () => {
    expect(deletePrompt(row({ status: "submitted", syncStatus: "syncing" })).allowed).toBe(false);
  });
});

// ── Home screen: the trash button deletes after confirming ─────────────

const mockRows: SurveySummary[] = [];
const mockDelete = jest.fn(async (id: string) => {
  const i = mockRows.findIndex((r) => r.id === id);
  if (i >= 0) mockRows.splice(i, 1);
});
jest.mock("expo-router", () => {
  const React = require("react");
  return { useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), useFocusEffect: (cb: () => void) => React.useEffect(cb, []) };
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { email: "james@example.com" }, signOut: jest.fn() }) }));
jest.mock("../../context/BugReportContext", () => ({ useBugReport: () => ({ openBugReport: jest.fn() }) }));
jest.mock("../../services/SyncManager", () => ({
  isOnline: () => true,
  onSurveyUploadProgress: () => () => undefined,
  onSyncStatusChange: () => () => undefined,
  syncPending: jest.fn(async () => undefined),
}));
jest.mock("../repo", () => ({
  listSurveySummaries: jest.fn(async () => [...mockRows]),
  loadSurvey: jest.fn(async () => null),
  deleteSurveyAndFiles: (id: string) => mockDelete(id),
}));

// eslint-disable-next-line import/first
import { HomeScreen } from "../ui/HomeScreen";

it("the trash button on a row deletes that site after the crew confirms", async () => {
  mockRows.splice(0, mockRows.length, row(), row({ id: "j1", title: "Byron Witt", kind: "install", photoCount: 2, uploadedCount: 2 }));
  const alert = jest.spyOn(Alert, "alert");
  render(<HomeScreen />);
  await screen.findByText("Kay Hinnen");

  fireEvent.press(screen.getByLabelText("Delete Kay Hinnen"));
  expect(alert).toHaveBeenCalledWith("Delete this survey?", expect.stringContaining("Kay Hinnen"), expect.any(Array));
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  await act(async () => {
    await buttons.find((b) => b.text === "Delete")!.onPress!();
  });
  expect(mockDelete).toHaveBeenCalledWith("s1");
  await waitFor(() => expect(screen.queryByText("Kay Hinnen")).toBeNull());
  expect(screen.getByText("Byron Witt")).toBeTruthy();

  // Cancel leaves the install job alone.
  alert.mockClear();
  fireEvent.press(screen.getByLabelText("Delete Byron Witt"));
  expect(alert.mock.calls[0][0]).toBe("Remove this job from this phone?");
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

// ── Bug report: the sheet rises above the keyboard ────────────────────

it("the bug report sheet lifts by the keyboard height while typing", () => {
  const listeners: Record<string, (e: { endCoordinates: { height: number } }) => void> = {};
  jest.spyOn(Keyboard, "addListener").mockImplementation(((evt: string, cb: (e: { endCoordinates: { height: number } }) => void) => {
    listeners[evt] = cb;
    return { remove: jest.fn() };
  }) as never);
  let h = -1;
  function Probe() {
    h = useKeyboardHeight();
    return null;
  }
  render(<Probe />);
  expect(h).toBe(0);
  const show = Object.keys(listeners).find((k) => /Show/.test(k))!;
  const hide = Object.keys(listeners).find((k) => /Hide/.test(k))!;
  act(() => listeners[show]({ endCoordinates: { height: 310 } }));
  expect(h).toBe(310);
  act(() => listeners[hide]({ endCoordinates: { height: 0 } }));
  expect(h).toBe(0);
});
