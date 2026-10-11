// ============================================================
// A submitted (or in-progress) v2 survey: upload status with retry,
// reopen-to-edit while not yet uploaded, and what was captured.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isOnline, onSurveyUploadProgress, onSyncStatusChange, syncPending } from "../../services/SyncManager";
import { Button, Card, IconButton, T } from "../../ui/components";
import { color, radius, space } from "../../ui/theme";
import { STEPS } from "../blueprint";
import type { CapturedPhoto } from "../model";
import { checklistFromDoc } from "../payload";
import { absPath, deleteSurveyAndFiles, loadSurvey, reopenSurvey, type StoredSurvey } from "../repo";
import { shareSurveyPdf } from "../report";

export function SurveyStatusScreen({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [survey, setSurvey] = React.useState<StoredSurvey | null>(null);
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const loaded = await loadSurvey(surveyId);
    if (!loaded) return;
    setSurvey(loaded.survey);
    setPhotos(loaded.photos);
  }, [surveyId]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  React.useEffect(() => {
    const a = onSyncStatusChange(() => void load());
    const b = onSurveyUploadProgress((id, done, total) => {
      if (id === surveyId) setProgress({ done, total });
    });
    return () => {
      a();
      b();
    };
  }, [load, surveyId]);

  if (!survey) return <View style={s.root} />;

  const uploaded = photos.filter((p) => p.uploadState === "uploaded").length;
  const hero = {
    local: { icon: "create-outline" as const, tint: color.amber, title: "In progress", body: "Not submitted yet." },
    pending: { icon: "cloud-upload-outline" as const, tint: color.blue, title: "Waiting to upload", body: isOnline() ? "Starting upload…" : "Uploads when you have signal." },
    syncing: {
      icon: "cloud-upload" as const,
      tint: color.blue,
      title: "Uploading",
      body: `${progress?.done ?? uploaded}/${progress?.total ?? photos.length} photos sent. You can leave this screen.`,
    },
    error: {
      icon: "cloud-offline-outline" as const,
      tint: color.amber,
      title: "Upload paused",
      body: `${survey.syncError ?? "Upload failed"}${survey.nextRetryAt ? `\nNext try ${new Date(survey.nextRetryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : ""}`,
    },
    synced: { icon: "cloud-done" as const, tint: color.green, title: "In SolarPro", body: `Survey and all ${photos.length} photos uploaded.` },
  }[survey.syncStatus];

  const summary = checklistFromDoc(survey.doc, photos);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.top}>
        <IconButton icon="chevron-back" label="Back to surveys" onPress={() => router.replace("/")} />
        <T variant="title" numberOfLines={1} style={{ flex: 1 }}>
          {survey.doc.project.projectName || (survey.doc.answers.site_address as string) || "Site survey"}
        </T>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + 40 }}>
        <Card style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <Ionicons name={hero.icon} size={40} color={hero.tint} />
          <View style={{ flex: 1 }}>
            <T variant="title">{hero.title}</T>
            <T dim>{hero.body}</T>
          </View>
        </Card>

        <View style={{ gap: space.sm }}>
          <Button
            label="Share PDF report"
            icon="document-text-outline"
            kind="secondary"
            busy={pdfBusy}
            onPress={async () => {
              setPdfBusy(true);
              try {
                await shareSurveyPdf(survey.doc, photos);
              } catch (e) {
                Alert.alert("Report not made", e instanceof Error ? e.message : String(e));
              } finally {
                setPdfBusy(false);
              }
            }}
          />
          {survey.status === "draft" ? (
            <Button label="Continue survey" icon="arrow-forward" onPress={() => router.replace(`/survey/${surveyId}/capture`)} />
          ) : null}
          {survey.syncStatus === "error" || survey.syncStatus === "pending" ? (
            <Button label="Retry upload now" icon="refresh" onPress={() => void syncPending({ force: true })} disabled={!isOnline()} />
          ) : null}
          {survey.status === "submitted" && survey.syncStatus !== "synced" ? (
            <Button
              label="Reopen to edit"
              icon="create-outline"
              kind="secondary"
              onPress={async () => {
                if (await reopenSurvey(surveyId)) router.replace(`/survey/${surveyId}/capture`);
                else Alert.alert("Already uploading", "Try again in a moment.");
              }}
            />
          ) : null}
        </View>

        {summary.map((row, i) => {
          const step = STEPS[i];
          const stepPhotos = photos.filter((p) => p.stepId === step.id && p.qualityStatus !== "rejected");
          return (
            <Card key={row.label} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Ionicons
                  name={row.status === "fail" ? "alert-circle" : "checkmark-circle"}
                  size={22}
                  color={row.status === "fail" ? color.amber : color.green}
                />
                <T variant="title" style={{ flex: 1 }}>
                  {row.label}
                </T>
                <T dim>{stepPhotos.length} photos</T>
              </View>
              {row.notes ? (
                <T variant="small" dim>
                  {row.notes}
                </T>
              ) : null}
              {stepPhotos.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                  {stepPhotos.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => router.push(`/survey/${surveyId}/photo/${p.id}`)}
                      accessibilityRole="imagebutton"
                      accessibilityLabel="Open photo"
                    >
                      <Image source={{ uri: absPath(p.annotatedRelPath ?? p.relPath) }} style={s.thumb} />
                      <View style={s.thumbBadge}>
                        <Ionicons
                          name={p.uploadState === "uploaded" ? "cloud-done" : "phone-portrait-outline"}
                          size={14}
                          color={p.uploadState === "uploaded" ? color.green : color.textDim}
                        />
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </Card>
          );
        })}

        {survey.syncStatus === "synced" || survey.status === "draft" ? (
          <Button
            label={survey.syncStatus === "synced" ? "Remove from this phone" : "Delete draft"}
            icon="trash-outline"
            kind="danger"
            onPress={() =>
              Alert.alert(
                survey.syncStatus === "synced" ? "Remove from this phone?" : "Delete this draft?",
                survey.syncStatus === "synced"
                  ? "It stays in SolarPro. Photos are removed from this phone to free space."
                  : "Everything captured for it is deleted from this phone. This can't be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await deleteSurveyAndFiles(surveyId);
                      router.replace("/");
                    },
                  },
                ],
              )
            }
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  top: { flexDirection: "row", alignItems: "center", backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.border, paddingRight: space.lg },
  thumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: color.surfaceRaised },
  thumbBadge: { position: "absolute", right: 4, bottom: 4, backgroundColor: color.overlay, borderRadius: 10, padding: 2 },
});
