import React, { useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import axios from "axios";
import { API_URL } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { convertPitchToDegrees } from "../services/pitch";
import {
  ARInspectionCamera,
  type ARCameraDetection,
} from "../components/ARInspectionCamera";
import { uploadInferAndSyncSurveyPhotos } from "../services/photoInferencePipeline";
import {
  processInference,
  type RoboflowInferenceResult,
} from "../services/processInference";

interface UploadResponse {
  filePath: string;
}

interface CreatedSurveyResponse {
  id: string;
  project_id?: string | null;
}

interface ARSessionState {
  surveyId: string;
  projectId: string;
}

const LIVE_SYNC_INTERVAL_MS = 3000;
const ELECTRICAL_CLASSES = new Set([
  "panel",
  "meter",
  "disconnect",
  "breaker",
  "msp",
  "main_service_panel",
]);

function getPitchPreview(value: string): {
  degrees: number | null;
  error: string | null;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { degrees: null, error: null };
  }

  if (trimmed.includes("/")) {
    try {
      return { degrees: convertPitchToDegrees(trimmed), error: null };
    } catch {
      return {
        degrees: null,
        error: "Invalid ratio. Use Rise/Run like 5/12.",
      };
    }
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return { degrees: null, error: "Enter degrees or ratio like 5/12." };
  }

  return { degrees: numeric, error: null };
}

export default function NewSurveyScreen() {
  const router = useRouter();
  const { token, user } = useAuth();

  const [roofPitch, setRoofPitch] = useState("");
  const [azimuth, setAzimuth] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showARCamera, setShowARCamera] = useState(false);
  const [latestDetections, setLatestDetections] = useState<ARCameraDetection[]>(
    [],
  );
  const [arSession, setArSession] = useState<ARSessionState | null>(null);
  const [liveSyncCount, setLiveSyncCount] = useState(0);
  const [liveSyncStatus, setLiveSyncStatus] = useState<
    "idle" | "syncing" | "ok" | "error"
  >("idle");

  const lastLiveSyncAtRef = useRef(0);
  const liveSyncInFlightRef = useRef(false);

  const pitchPreview = getPitchPreview(roofPitch);

  async function capturePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera Permission Needed",
        "Please allow camera access to capture a photo.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  function validateInputs(): {
    pitchValue: number;
    azimuthValue: number;
  } | null {
    const trimmedPitch = roofPitch.trim();
    let pitchValue: number;

    try {
      pitchValue = trimmedPitch.includes("/")
        ? convertPitchToDegrees(trimmedPitch)
        : Number(trimmedPitch);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Invalid pitch format. Use 'Rise/Run' (e.g., 4/12)";
      Alert.alert("Validation Error", message);
      return null;
    }

    const azimuthValue = Number(azimuth);

    if (!Number.isFinite(pitchValue) || pitchValue < 0 || pitchValue > 90) {
      Alert.alert(
        "Validation Error",
        "Roof Pitch must be a number between 0 and 90.",
      );
      return null;
    }

    if (
      !Number.isFinite(azimuthValue) ||
      azimuthValue < 0 ||
      azimuthValue > 360
    ) {
      Alert.alert(
        "Validation Error",
        "Azimuth must be a number between 0 and 360.",
      );
      return null;
    }

    return { pitchValue, azimuthValue };
  }

  async function ensureARSession(): Promise<ARSessionState | null> {
    if (!token) {
      Alert.alert(
        "Authentication Required",
        "Please sign in before starting AR inspection.",
      );
      return null;
    }

    if (arSession) return arSession;

    const azimuthValue = Number(azimuth);
    const safeAzimuth = Number.isFinite(azimuthValue)
      ? Math.min(360, Math.max(0, azimuthValue))
      : null;

    const response = await axios.post<CreatedSurveyResponse>(
      `${API_URL}/api/surveys`,
      {
        project_name: `AR Session ${new Date().toISOString().slice(0, 10)}`,
        inspector_name: user?.fullName ?? "Mobile Inspector",
        site_name: "Mobile AR Inspection",
        category_name: "Electrical",
        status: "draft",
        notes: "Live AR session created from mobile camera.",
        metadata: {
          type: "roof_mount",
          roof_material: null,
          rafter_size: null,
          rafter_spacing: null,
          roof_age_years: null,
          azimuth: safeAzimuth,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const created = response.data;
    const session = {
      surveyId: created.id,
      projectId: created.project_id ?? created.id,
    };
    setArSession(session);
    return session;
  }

  function mapCameraDetectionsToInference(
    results: ARCameraDetection[],
  ): RoboflowInferenceResult {
    const electrical = results
      .filter((d) => ELECTRICAL_CLASSES.has(d.class.toLowerCase()))
      .map((d) => ({
        class: d.class,
        confidence: d.confidence,
        track_id: d.track_id,
      }));

    const exterior = results
      .filter((d) => !ELECTRICAL_CLASSES.has(d.class.toLowerCase()))
      .map((d) => ({
        class: d.class,
        confidence: d.confidence,
        track_id: d.track_id,
      }));

    const trackIds = Array.from(new Set(results.map((d) => d.track_id)));

    return {
      electrical,
      exterior,
      track_ids: trackIds,
      roof_type: "shingle",
      distances: {},
      measurements: {},
    };
  }

  async function toggleARCamera() {
    if (showARCamera) {
      setShowARCamera(false);
      return;
    }

    try {
      const session = await ensureARSession();
      if (!session) return;
      setShowARCamera(true);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? ((error.response?.data?.error as string | undefined) ?? error.message)
        : "Failed to start AR session";
      Alert.alert("AR Session Error", message);
    }
  }

  async function submitSurvey() {
    if (!token) {
      Alert.alert(
        "Authentication Required",
        "Please sign in before creating a survey.",
      );
      return;
    }

    const values = validateInputs();
    if (!values) return;

    setSubmitting(true);
    try {
      let uploadedFilePath: string | null = null;

      if (photoUri) {
        const formData = new FormData();
        formData.append("image", {
          uri: photoUri,
          name: "roof-photo.jpg",
          type: "image/jpeg",
        } as never);

        const uploadResponse = await axios.post<UploadResponse>(
          `${API_URL}/api/surveys/upload`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data",
            },
          },
        );

        uploadedFilePath = uploadResponse.data.filePath;
      }

      const noteParts = [`Roof pitch: ${values.pitchValue}°`];
      if (uploadedFilePath) {
        noteParts.push(`Photo: ${uploadedFilePath}`);
      }

      let createdSurvey: CreatedSurveyResponse;

      if (arSession) {
        await axios.put(
          `${API_URL}/api/surveys/${arSession.surveyId}`,
          {
            category_name: "Roof Mount",
            notes: noteParts.join("\n"),
            status: "submitted",
            metadata: {
              type: "roof_mount",
              roof_material: null,
              rafter_size: null,
              rafter_spacing: null,
              roof_age_years: null,
              azimuth: values.azimuthValue,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        createdSurvey = {
          id: arSession.surveyId,
          project_id: arSession.projectId,
        };
      } else {
        const createSurveyResponse = await axios.post<CreatedSurveyResponse>(
          `${API_URL}/api/surveys`,
          {
            project_name: `Roof Survey ${new Date().toISOString().slice(0, 10)}`,
            inspector_name: user?.fullName ?? "Mobile Inspector",
            site_name: "Mobile Roof Survey",
            category_name: "Roof Mount",
            status: "draft",
            notes: noteParts.join("\n"),
            metadata: {
              type: "roof_mount",
              roof_material: null,
              rafter_size: null,
              rafter_spacing: null,
              roof_age_years: null,
              azimuth: values.azimuthValue,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        createdSurvey = createSurveyResponse.data;
      }

      // If a photo was captured, run end-to-end Roboflow workflow:
      // upload -> infer -> AR detection sync to backend pipeline.
      if (photoUri) {
        const inferenceSync = await uploadInferAndSyncSurveyPhotos({
          surveyId: createdSurvey.id,
          projectId: createdSurvey.project_id ?? createdSurvey.id,
          authToken: token,
          photos: [
            {
              uri: photoUri,
              label: "Roof Survey Capture",
              mimeType: "image/jpeg",
            },
          ],
          inference: {
            model_id: "electrical-inspection/1",
            confidence: 40,
            overlap: 30,
            elec_classes: ["meter", "panel"],
            material_classes: ["shingle", "metal", "tile"],
          },
          roofType: "shingle",
          minPredictionConfidence: 60,
          minTrackCountToSync: 1,
        });

        if (inferenceSync.skipped > 0) {
          const firstReason = inferenceSync.skippedReasons[0]?.reason;
          const suffix =
            typeof firstReason === "string" && firstReason.length > 0
              ? ` ${firstReason}.`
              : "";
          Alert.alert(
            "Inference Review Needed",
            `${inferenceSync.skipped} photo(s) were not synced to AR due to low-confidence detections.${suffix}`,
          );
        }
      }

      Alert.alert("Success", "Survey submitted successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? ((error.response?.data?.error as string | undefined) ?? error.message)
        : "Failed to submit survey";
      Alert.alert("Submission Error", message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleARDetection(results: ARCameraDetection[]) {
    setLatestDetections(results);

    if (!token || !arSession) return;
    if (results.length === 0) return;

    const now = Date.now();
    if (liveSyncInFlightRef.current) return;
    if (now - lastLiveSyncAtRef.current < LIVE_SYNC_INTERVAL_MS) return;

    const inferencePayload = mapCameraDetectionsToInference(results);
    if (inferencePayload.track_ids.length === 0) return;

    liveSyncInFlightRef.current = true;
    lastLiveSyncAtRef.current = now;
    setLiveSyncStatus("syncing");

    void processInference(
      arSession.surveyId,
      arSession.projectId,
      token,
      inferencePayload,
    )
      .then((res) => {
        if (res) {
          setLiveSyncCount((n) => n + 1);
        }
        setLiveSyncStatus("ok");
      })
      .catch((err) => {
        console.error("Live AR sync failed", err);
        setLiveSyncStatus("error");
      })
      .finally(() => {
        liveSyncInFlightRef.current = false;
      });
  }

  function detectComponentsMock(): ARCameraDetection[] {
    // Placeholder for Vision Camera + Roboflow worklet integration.
    // Replace with your real detectComponents(frame) implementation.
    return [];
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>New Solar Survey</Text>

          <Text style={styles.label}>Roof Pitch</Text>
          <TextInput
            style={styles.input}
            value={roofPitch}
            onChangeText={setRoofPitch}
            placeholder="Enter roof pitch (degrees or 4/12)"
            placeholderTextColor="#9ca3af"
          />
          {pitchPreview.error ? (
            <Text style={styles.pitchErrorText}>{pitchPreview.error}</Text>
          ) : pitchPreview.degrees != null ? (
            <Text style={styles.pitchPreviewText}>
              Calculated angle: {pitchPreview.degrees.toFixed(2)}°
            </Text>
          ) : null}

          <Text style={styles.label}>Azimuth</Text>
          <TextInput
            style={styles.input}
            value={azimuth}
            onChangeText={setAzimuth}
            keyboardType="numeric"
            placeholder="Enter azimuth (0-360)"
            placeholderTextColor="#9ca3af"
          />

          <TouchableOpacity
            style={styles.captureButton}
            onPress={capturePhoto}
            disabled={submitting}
          >
            <Text style={styles.captureButtonText}>Capture Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.arButton}
            onPress={toggleARCamera}
            disabled={submitting}
          >
            <Text style={styles.arButtonText}>
              {showARCamera ? "Hide AR Camera" : "Open AR Camera"}
            </Text>
          </TouchableOpacity>

          {showARCamera ? (
            <View style={styles.arContainer}>
              <ARInspectionCamera
                onDetection={handleARDetection}
                detectComponents={detectComponentsMock}
              />
            </View>
          ) : null}

          <Text style={styles.detectionText}>
            Live detections: {latestDetections.length}
          </Text>

          <Text style={styles.liveSyncText}>
            Live sync: {liveSyncStatus} • Synced batches: {liveSyncCount}
          </Text>

          <Text style={styles.sessionText}>
            AR session: {arSession ? arSession.surveyId : "not started"}
          </Text>

          <Text style={styles.photoText}>
            {photoUri
              ? `Photo selected: ${photoUri.split("/").pop() ?? "captured"}`
              : "No photo selected"}
          </Text>

          <TouchableOpacity
            style={[
              styles.submitButton,
              submitting && styles.submitButtonDisabled,
            ]}
            onPress={submitSurvey}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Survey</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: "#0b1220",
  },
  container: {
    padding: 20,
    gap: 12,
  },
  title: {
    color: "#f8fafc",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 12,
  },
  label: {
    color: "#cbd5e1",
    fontSize: 15,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#111827",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  captureButton: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#1d4ed8",
    paddingVertical: 12,
    alignItems: "center",
  },
  arButton: {
    borderRadius: 10,
    backgroundColor: "#7c3aed",
    paddingVertical: 12,
    alignItems: "center",
  },
  arButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  arContainer: {
    height: 280,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#020617",
  },
  captureButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  detectionText: {
    color: "#67e8f9",
    fontSize: 13,
    marginTop: -2,
  },
  liveSyncText: {
    color: "#c4b5fd",
    fontSize: 13,
    marginTop: -2,
  },
  sessionText: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: -2,
  },
  photoText: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 10,
  },
  pitchPreviewText: {
    color: "#86efac",
    fontSize: 13,
    marginTop: -4,
    marginBottom: 8,
  },
  pitchErrorText: {
    color: "#fca5a5",
    fontSize: 13,
    marginTop: -4,
    marginBottom: 8,
  },
  submitButton: {
    borderRadius: 10,
    backgroundColor: "#059669",
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
});
