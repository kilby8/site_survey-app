import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { newInstallDoc, newSurveyDoc, type SurveyDoc } from "../model";
import type { StoredSurvey } from "../repo";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: "s", Warning: "w" },
}));
jest.mock("expo-location", () => ({ requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })) }));
jest.mock("../../api/client", () => ({ finishInstallPhase: jest.fn(async () => ({ event_id: "e" })) }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("../../services/SyncManager", () => ({
  syncPending: jest.fn(async () => undefined),
  syncInstallJobs: jest.fn(async () => undefined),
  installJobSyncState: () => ({ lastSyncedAt: null, waiting: 0, error: null }),
  onInstallJobSync: () => () => undefined,
}));
jest.mock("../../context/BugReportContext", () => ({ useBugReport: () => ({ openBugReport: jest.fn() }) }));
jest.mock("../report", () => ({ shareSurveyPdf: jest.fn() }));
jest.mock("../capture", () => ({
  currentFix: jest.fn(async () => ({ gps: null, heading: null })),
  takePhoto: jest.fn(async () => ({ kind: "cancelled" })),
  pickFromLibrary: jest.fn(async () => []),
  recoverPendingCapture: jest.fn(async () => null),
}));

let mockDoc: SurveyDoc;
const mockSaveDoc = jest.fn(async () => undefined);
const mockSubmit = jest.fn(async () => undefined);
jest.mock("../repo", () => ({
  loadSurvey: jest.fn(async () => ({
    survey: {
      id: "s1", doc: mockDoc, currentStep: "project_arrival", status: "draft", syncStatus: "local", syncError: null,
      syncAttempts: 0, nextRetryAt: null, serverPosted: false, ownerEmail: null, deviceId: null, submittedAt: null,
      createdAt: "t", updatedAt: "t",
    } satisfies StoredSurvey,
    photos: [],
  })),
  loadPhotos: jest.fn(async () => []),
  saveDoc: (...a: unknown[]) => mockSaveDoc(...(a as [])),
  submitSurvey: (...a: unknown[]) => mockSubmit(...(a as [])),
  updatePhoto: jest.fn(),
  removePhoto: jest.fn(),
  absPath: (p: string) => p,
}));

// eslint-disable-next-line import/first
import { CaptureScreen } from "../ui/CaptureScreen";

/**
 * Regression: opening an install job crashed the Android app. On the old
 * architecture state updates after an await aren't batched, so the screen
 * rendered the job while the step was still the editor's default
 * ("project_arrival"), which install jobs don't have. The repo mock below
 * returns exactly that step.
 */
it("opens an install job even when the step is a survey step, and walks every phase", async () => {
  mockDoc = newInstallDoc({
    installType: "roof_mount",
    project: { solarproProjectId: "p1", solarproClientId: "c1", projectName: "Lindsey", clientName: "Lindsey" },
    inspectorName: "James",
    siteAddress: "27 Oak Ct",
  });
  let caught: Error | null = null;
  class Boundary extends React.Component<{ children: React.ReactNode }, { e: Error | null }> {
    state = { e: null as Error | null };
    static getDerivedStateFromError(e: Error) { return { e }; }
    componentDidCatch(e: Error) { caught = e; }
    render() { return this.state.e ? null : this.props.children; }
  }
  render(<Boundary><CaptureScreen surveyId="s1" /></Boundary>);
  expect(await screen.findByText(/STEP 1 OF 2/, {}, { timeout: 15000 })).toBeTruthy();
  expect(screen.getAllByText(/Install day/).length).toBeGreaterThan(0);
  for (const label of ["Final", "Review"]) {
    const tab = screen.getAllByRole("tab").find((t) => JSON.stringify(t.props.accessibilityLabel ?? "").includes(label));
    if (tab) fireEvent.press(tab);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
  expect(caught).toBeNull();
}, 30000);
