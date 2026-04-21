import React, { useState } from "react";
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
import { uploadInferAndSyncSurveyPhotos } from "../services/photoInferencePipeline";
import { solarProTheme } from "../theme/solarProTheme";

const { colors } = solarProTheme;

interface UploadResponse {
  filePath: string;
}

interface CreatedSurveyResponse {
  id: string;
  project_id?: string | null;
}

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

      // Create survey
      const surveyResponse = await axios.post<CreatedSurveyResponse>(
        `${API_URL}/api/surveys`,
        {
          project_name: "Mobile Photo Capture",
          inspector_name: user?.fullName ?? "Mobile Inspector",
          site_name: "Solar Site",
          category_name: "Electrical",
          status: "draft",
          notes: noteParts.join(" | "),
          metadata: {
            type: "roof_mount",
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

      const surveyId = surveyResponse.data.id;

      // Upload and infer photos
      if (photoUri) {
        await uploadInferAndSyncSurveyPhotos({
          surveyId,
          projectId: surveyResponse.data.project_id ?? surveyId,
          authToken: token,
          photos: [
            {
              uri: photoUri,
              label: "Roof Photo",
              mimeType: "image/jpeg",
            },
          ],
          roofType: "shingle",
        });
      }

      Alert.alert("Success", "Survey created and photos analyzed!");
      router.push(`/surveys/${surveyId}`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? ((error.response?.data?.error as string | undefined) ?? error.message)
        : "Failed to create survey";
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>New Survey</Text>

          <View style={styles.section}>
            <Text style={styles.label}>Roof Pitch</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter pitch (e.g., 5/12 or 22.6)"
              value={roofPitch}
              onChangeText={setRoofPitch}
              placeholderTextColor={colors.textMuted}
            />
            {pitchPreview.degrees !== null && (
              <Text style={styles.preview}>
                ✓ {pitchPreview.degrees.toFixed(1)}°
              </Text>
            )}
            {pitchPreview.error && (
              <Text style={styles.error}>{pitchPreview.error}</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Azimuth (0-360°)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter azimuth direction"
              value={azimuth}
              onChangeText={setAzimuth}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Photo</Text>
            {photoUri ? (
              <View style={styles.photoPreview}>
                <Text style={styles.photoText}>✓ Photo selected</Text>
                <TouchableOpacity
                  style={styles.changePhotoBtn}
                  onPress={capturePhoto}
                >
                  <Text style={styles.btnText}>Change Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.captureBtn} onPress={capturePhoto}>
                <Text style={styles.btnText}>📷 Capture Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submitSurvey}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.btnText}>Create Survey</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 6,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 16,
  },
  preview: {
    color: colors.successText,
    fontSize: 12,
    marginTop: 4,
  },
  error: {
    color: colors.errorText,
    fontSize: 12,
    marginTop: 4,
  },
  photoPreview: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 6,
    padding: 16,
    alignItems: "center",
    gap: 12,
  },
  photoText: {
    color: colors.successText,
    fontSize: 16,
  },
  captureBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    padding: 14,
    alignItems: "center",
  },
  changePhotoBtn: {
    backgroundColor: colors.inputBorder,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: "600",
  },
});
