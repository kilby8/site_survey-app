import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { useAuth } from "../context/AuthContext";
import { useAppBootstrap } from "../context/AppBootstrapContext";
import { createSurvey } from "../database/surveyDb";
import type { SurveyFormData, SurveyMetadata } from "../types";
import { DEFAULT_CHECKLIST, SURVEY_CATEGORIES } from "../types";
import ChecklistEditor, { type ChecklistItemDraft } from "../components/ChecklistEditor";
import GPSCapture from "../components/GPSCapture";
import PhotoCapture, { type PhotoDraft } from "../components/PhotoCapture";
import SolarMetadataForm from "../components/SolarMetadataForm";
import { useLocation } from "../hooks/useLocation";
import { solarProTheme } from "../theme/solarProTheme";
import { fetchHandoffToken } from "../api/client";

const { colors } = solarProTheme;
const AUTO_SAVE_INTERVAL_MS = 300_000;
const DRAFTS_DIR = `${FileSystem.documentDirectory}survey-drafts/`;

interface NewSurveyDraft {
  saved_at: string;
  project_name: string;
  inspector_name: string;
  site_name: string;
  site_address: string;
  category_id: string | null;
  notes: string;
  coordinates: { latitude: number; longitude: number; accuracy?: number } | null;
  metadata: SurveyMetadata | null;
  checklist: ChecklistItemDraft[];
  photos: PhotoDraft[];
  user_id: string | null;
}

export default function NewSurveyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ t?: string }>();
  const handoffToken = typeof params.t === "string" ? params.t : null;
  const { user } = useAuth();
  const { deviceId } = useAppBootstrap();
  const location = useLocation();

  const [projectName, setProjectName] = useState("Mobile Site Survey");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [inspectorName, setInspectorName] = useState(user?.fullName ?? "");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>("roof_mount");
  const [metadata, setMetadata] = useState<SurveyMetadata | null>(null);
  const [notes, setNotes] = useState("");
  const [handoffLinked, setHandoffLinked] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItemDraft[]>(
    DEFAULT_CHECKLIST.map((c) => ({
      label: c.label,
      status: c.status,
      notes: c.notes,
      photos: [],
    })),
  );
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [draftFileUri, setDraftFileUri] = useState<string | null>(null);

  const selectedCategoryName = useMemo(() => {
    const found = SURVEY_CATEGORIES.find((c) => c.id === (categoryId ?? ""));
    return found?.name ?? null;
  }, [categoryId]);

  const solarCategoryIds = new Set(["ground_mount", "roof_mount", "solar_fencing"]);

  const buildDraftPayload = useCallback((): NewSurveyDraft => ({
    saved_at: new Date().toISOString(),
    project_name: projectName,
    inspector_name: inspectorName,
    site_name: siteName,
    site_address: siteAddress,
    category_id: categoryId,
    notes,
    coordinates: location.coordinates,
    metadata,
    checklist,
    photos,
    user_id: user?.id ?? null,
  }), [
    projectName,
    inspectorName,
    siteName,
    siteAddress,
    categoryId,
    notes,
    location.coordinates,
    metadata,
    checklist,
    photos,
    user?.id,
  ]);

  const saveDraftToFile = useCallback(async () => {
    if (!draftFileUri) return;
    await FileSystem.writeAsStringAsync(
      draftFileUri,
      JSON.stringify(buildDraftPayload(), null, 2),
      { encoding: FileSystem.EncodingType.UTF8 },
    );
  }, [buildDraftPayload, draftFileUri]);

  // Create a single draft file when the screen opens
  useEffect(() => {
    let mounted = true;

    async function initDraftFile() {
      try {
        await FileSystem.makeDirectoryAsync(DRAFTS_DIR, { intermediates: true });
        const uri = `${DRAFTS_DIR}draft-${Date.now()}.json`;
        await FileSystem.writeAsStringAsync(
          uri,
          JSON.stringify(buildDraftPayload(), null, 2),
          { encoding: FileSystem.EncodingType.UTF8 },
        );
        if (mounted) setDraftFileUri(uri);
      } catch (err) {
        console.error("Draft init error:", err);
      }
    }

    initDraftFile();
    return () => {
      mounted = false;
    };
    // intentionally run once for file creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft every 300 seconds and once on unmount
  useEffect(() => {
    if (!draftFileUri) return;

    const timer = setInterval(() => {
      saveDraftToFile().catch((err) =>
        console.error("Draft autosave error:", err),
      );
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      saveDraftToFile().catch((err) =>
        console.error("Draft final save error:", err),
      );
    };
  }, [draftFileUri, saveDraftToFile]);

  useEffect(() => {
    if (categoryId && !solarCategoryIds.has(categoryId)) {
      setMetadata(null);
    }
  }, [categoryId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromHandoff() {
      if (!handoffToken) return;
      try {
        const handoff = await fetchHandoffToken(handoffToken);
        if (cancelled) return;

        setProjectId(handoff.project_id);
        if (handoff.project_name) setProjectName(handoff.project_name);
        if (handoff.inspector_name) setInspectorName(handoff.inspector_name);
        if (handoff.site_name) setSiteName(handoff.site_name);
        if (handoff.site_address) setSiteAddress(handoff.site_address);
        if (handoff.category_id) setCategoryId(handoff.category_id);
        if (handoff.notes) setNotes(handoff.notes);
        if (handoff.metadata) {
          setMetadata(handoff.metadata as unknown as SurveyMetadata);
        }
        setHandoffLinked(true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load handoff token";
        Alert.alert("Handoff Error", message);
      }
    }

    hydrateFromHandoff();
    return () => {
      cancelled = true;
    };
  }, [handoffToken]);

  function validateInputs(): boolean {
    if (!projectName.trim()) {
      Alert.alert("Validation Error", "Project name is required.");
      return false;
    }
    if (!inspectorName.trim()) {
      Alert.alert("Validation Error", "Inspector name is required.");
      return false;
    }
    if (!siteName.trim()) {
      Alert.alert("Validation Error", "Site name is required.");
      return false;
    }
    return true;
  }

  async function submitSurvey() {
    if (!validateInputs()) return;

    if (!deviceId) {
      Alert.alert(
        "Device Error",
        "Device identity is not ready yet. Please try again in a moment.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();

      const checklistPhotos = checklist.flatMap((item) =>
        (item.photos ?? []).map((p) => ({
          file_path: p.uri,
          label: p.label?.trim() || `${item.label} Photo`,
          mime_type: p.mimeType,
          captured_at: now,
        })),
      );

      const payload: SurveyFormData = {
        project_name: projectName.trim(),
        project_id: projectId,
        category_id: categoryId,
        category_name: selectedCategoryName,
        inspector_name: inspectorName.trim(),
        site_name: siteName.trim(),
        site_address: siteAddress.trim(),
        latitude: location.coordinates?.latitude ?? null,
        longitude: location.coordinates?.longitude ?? null,
        gps_accuracy: location.coordinates?.accuracy ?? null,
        survey_date: now,
        notes: notes.trim(),
        status: "draft",
        device_id: deviceId,
        metadata: metadata ?? null,
        checklist: checklist.map((item, i) => ({
          label: item.label.trim() || `Checklist Item ${i + 1}`,
          status: item.status,
          notes: item.notes ?? "",
          sort_order: i,
        })),
        photos: [
          ...photos.map((p) => ({
            file_path: p.uri,
            label: p.label,
            mime_type: p.mimeType,
            captured_at: now,
          })),
          ...checklistPhotos,
        ],
      };

      const created = await createSurvey(payload, deviceId);

      if (draftFileUri) {
        await FileSystem.deleteAsync(draftFileUri, { idempotent: true });
      }

      Alert.alert("Success", "Survey saved locally and queued for sync.");
      router.push({ pathname: "/survey/[id]", params: { id: created.id } });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create survey";
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
          <Text style={styles.autoSaveHint}>Auto-saving draft every 300 seconds</Text>

          {handoffLinked && projectName.trim() && (
            <View style={styles.linkedBanner}>
              <Text style={styles.linkedBannerText}>
                Linked to SolarPro project: {projectName.trim()}
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.label}>Project Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter project name"
              value={projectName}
              onChangeText={setProjectName}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Inspector Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter inspector name"
              value={inspectorName}
              onChangeText={setInspectorName}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Site Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter site name"
              value={siteName}
              onChangeText={setSiteName}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Site Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter site address"
              value={siteAddress}
              onChangeText={setSiteAddress}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryRow}>
              {SURVEY_CATEGORIES.filter((c) => c.id).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.categoryBtn,
                    categoryId === c.id && styles.categoryBtnActive,
                  ]}
                  onPress={() => setCategoryId(c.id)}
                >
                  <Text
                    style={[
                      styles.categoryBtnText,
                      categoryId === c.id && styles.categoryBtnTextActive,
                    ]}
                  >
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <GPSCapture
            coordinates={location.coordinates}
            status={location.status}
            errorMsg={location.errorMsg}
            onCapture={location.capture}
            onClear={location.clear}
          />

          <SolarMetadataForm
            categoryId={categoryId}
            metadata={metadata}
            onChange={setMetadata}
          />

          <ChecklistEditor items={checklist} onChange={setChecklist} />

          <PhotoCapture photos={photos} onChange={setPhotos} />

          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Add survey notes"
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
            />
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
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  autoSaveHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 16,
  },
  linkedBanner: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  linkedBannerText: {
    color: colors.successText,
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    marginBottom: 16,
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
  textArea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryBtn: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  categoryBtnTextActive: {
    color: colors.background,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
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
