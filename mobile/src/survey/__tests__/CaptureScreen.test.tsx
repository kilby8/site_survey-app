import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { newSurveyDoc, type SurveyDoc } from "../model";
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

beforeEach(() => {
  jest.clearAllMocks();
  mockDoc = newSurveyDoc({
    installType: "ground_mount",
    project: { solarproProjectId: "p1", solarproClientId: "c1", projectName: "Ranch", clientName: "Ranch" },
    inspectorName: "Tech",
    siteAddress: "1 County Rd",
  });
});

describe("CaptureScreen", () => {
  it("shows Arrival first, autosaves answers, and reveals hazard details on Yes", async () => {
    render(<CaptureScreen surveyId="s1" />);
    expect(await screen.findByText("Project Arrival", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText(/Describe the hazards/)).toBeNull();

    fireEvent.press(screen.getByLabelText("Any site hazards?: Yes"));
    expect(await screen.findByText(/Describe the hazards/)).toBeTruthy();
    expect(screen.getByText("Hazards")).toBeTruthy(); // the hazard photo slot appears too

    await waitFor(() => expect(mockSaveDoc).toHaveBeenCalled(), { timeout: 2000 });
    const saved = (mockSaveDoc.mock.calls.at(-1) as unknown as [string, SurveyDoc])[1];
    expect(saved.answers.hazards_present).toBe(true);
  });

  it("moves between steps with Next and the tabs", async () => {
    render(<CaptureScreen surveyId="s1" />);
    await screen.findByText("Project Arrival");
    fireEvent.press(screen.getByLabelText("Next: Walkaround"));
    expect(await screen.findByText("Site Walkaround")).toBeTruthy();
    fireEvent.press(screen.getByRole("tab", { name: /Roof & Array/ }));
    expect((await screen.findAllByText("Array area")).length).toBeGreaterThan(0); // ground mount section, not roof planes
    expect(screen.queryByText("Roof plane A")).toBeNull();
  });

  it("blocks submit until every gap is filled or skipped with a reason, then submits once", async () => {
    render(<CaptureScreen surveyId="s1" />);
    await screen.findByText("Project Arrival");
    fireEvent.press(screen.getByRole("tab", { name: /Review/ }));
    const submit = await screen.findByTestId("submit-survey");
    expect(submit.props.accessibilityState.disabled).toBe(true);

    // Skip every missing item with a reason.
    for (let guard = 0; guard < 40; guard++) {
      const skips = screen.queryAllByLabelText("Skip…");
      if (!skips.length) break;
      fireEvent.press(skips[0]);
      fireEvent.press(await screen.findByLabelText("Use reason: No access"));
      await act(async () => {
        fireEvent.press(screen.getByLabelText("Skip with this reason"));
      });
    }

    await waitFor(() => expect(screen.getByTestId("submit-survey").props.accessibilityState.disabled).toBe(false));
    await act(async () => {
      fireEvent.press(screen.getByTestId("submit-survey"));
    });
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith("s1"));
    expect(mockReplace).toHaveBeenCalledWith("/survey/s1");
  });

  it("requires a real reason (3+ characters) to skip", async () => {
    render(<CaptureScreen surveyId="s1" />);
    await screen.findByText("Project Arrival");
    fireEvent.press(screen.getByRole("tab", { name: /Review/ }));
    fireEvent.press((await screen.findAllByLabelText("Skip…"))[0]);
    const confirm = await screen.findByLabelText("Skip with this reason");
    expect(confirm.props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText("Reason"), "ok");
    expect(screen.getByLabelText("Skip with this reason").props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText("Reason"), "Gate locked");
    expect(screen.getByLabelText("Skip with this reason").props.accessibilityState.disabled).toBe(false);
  });
});
