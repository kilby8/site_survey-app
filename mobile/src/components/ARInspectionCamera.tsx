import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export type ARCameraDetection = {
  track_id: number;
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Frame = unknown;

type Props = {
  onDetection: (results: ARCameraDetection[]) => void;
  detectComponents: (frame: Frame) => ARCameraDetection[];
};

type VisionCameraModule = {
  Camera: React.ComponentType<{
    style: unknown;
    device: unknown;
    isActive: boolean;
    frameProcessor?: (frame: Frame) => void;
  }>;
  useCameraDevices: () => { back?: unknown };
  useFrameProcessor: (
    cb: (frame: Frame) => void,
    deps: ReadonlyArray<unknown>,
  ) => (frame: Frame) => void;
};

type WorkletsModule = {
  runAtTargetFps: (fps: number, cb: () => void) => void;
  runOnJS: <T extends (...args: any[]) => any>(fn: T) => T;
};

function loadVisionCameraModule(): VisionCameraModule | null {
  try {
    return require("react-native-vision-camera") as VisionCameraModule;
  } catch {
    return null;
  }
}

function loadWorkletsModule(): WorkletsModule | null {
  try {
    return require("react-native-worklets-core") as WorkletsModule;
  } catch {
    return null;
  }
}

export function ARInspectionCamera({ onDetection, detectComponents }: Props) {
  const [detections, setDetections] = useState<ARCameraDetection[]>([]);

  const visionCamera = useMemo(loadVisionCameraModule, []);
  const worklets = useMemo(loadWorkletsModule, []);

  if (!visionCamera || !worklets) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>AR camera unavailable</Text>
        <Text style={styles.fallbackText}>
          Install react-native-vision-camera and react-native-worklets-core to
          enable real-time AR detection overlays.
        </Text>
      </View>
    );
  }

  const { Camera, useCameraDevices, useFrameProcessor } = visionCamera;
  const { runAtTargetFps, runOnJS } = worklets;

  const handleDetectionResults = useCallback(
    (results: ARCameraDetection[]) => {
      setDetections(results);
      onDetection(results);
    },
    [onDetection],
  );

  const devices = useCameraDevices();
  const device = devices?.back;

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      "worklet";

      runAtTargetFps(5, () => {
        const results = detectComponents(frame);
        runOnJS(handleDetectionResults)(results);
      });
    },
    [detectComponents, handleDetectionResults],
  );

  if (device == null) {
    return <Text style={styles.loadingText}>Loading camera...</Text>;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
      />

      {detections.map((det) => (
        <View
          key={det.track_id}
          style={[
            styles.boundingBox,
            {
              top: det.y,
              left: det.x,
              width: det.width,
              height: det.height,
              borderColor: ["meter", "panel", "disconnect"].includes(det.class)
                ? "#FF4500"
                : "#00CED1",
            },
          ]}
        >
          <Text style={styles.label}>
            {det.class} {Math.round(det.confidence * 100)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#0f172a",
  },
  fallbackTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  fallbackText: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  loadingText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "600",
    padding: 16,
  },
  boundingBox: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 4,
  },
  label: {
    backgroundColor: "rgba(0,0,0,0.5)",
    color: "white",
    fontSize: 10,
    padding: 2,
  },
});
