// ============================================================
// Home: start a survey, resume one in progress, see uploads.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { isOnline, onSurveyUploadProgress, onSyncStatusChange, syncPending } from "../../services/SyncManager";
import { Badge, Button, IconButton, ProgressRing, T } from "../../ui/components";
import { color, radius, space } from "../../ui/theme";
import { INSTALL_TYPES, STEPS } from "../blueprint";
import { surveyReadiness } from "../progress";
import { listSurveySummaries, loadSurvey, type SurveySummary } from "../repo";

type Row = SurveySummary & { progress?: { done: number; total: number } };

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [online, setOnline] = React.useState(isOnline());
  const [refreshing, setRefreshing] = React.useState(false);
  const [uploading, setUploading] = React.useState<Record<string, { done: number; total: number }>>({});

  const load = React.useCallback(async () => {
    const list = await listSurveySummaries();
    const withProgress: Row[] = [];
    for (const r of list) {
      if (!r.legacy && r.status === "draft") {
        const loaded = await loadSurvey(r.id);
        if (loaded) {
          const rd = surveyReadiness(loaded.survey.doc, loaded.photos);
          withProgress.push({ ...r, progress: { done: rd.done, total: rd.total } });
          continue;
        }
      }
      withProgress.push(r);
    }
    setRows(withProgress);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  React.useEffect(() => {
    const offStatus = onSyncStatusChange((c) => {
      setOnline(c.isOnline);
      void load();
    });
    const offProgress = onSurveyUploadProgress((id, done, total) =>
      setUploading((u) => ({ ...u, [id]: { done, total } })),
    );
    return () => {
      offStatus();
      offProgress();
    };
  }, [load]);

  const drafts = rows.filter((r) => r.status === "draft");
  const waiting = rows.filter((r) => r.status === "submitted" && r.syncStatus !== "synced");
  const done = rows.filter((r) => r.status === "submitted" && r.syncStatus === "synced").slice(0, 30);

  const sections = [
    { key: "draft", title: "In progress", data: drafts },
    { key: "waiting", title: "Waiting to upload", data: waiting },
    { key: "done", title: "Uploaded", data: done },
  ].filter((sct) => sct.data.length);

  const doSignOut = () => {
    const unsent = drafts.length + waiting.length;
    Alert.alert(
      "Sign out?",
      unsent
        ? `${unsent} survey${unsent === 1 ? " hasn't" : "s haven't"} uploaded yet. They stay on this phone and upload when you sign back in.`
        : "You can sign back in with SolarPro.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() },
      ],
    );
  };

  const open = (r: Row) => {
    if (r.legacy) router.push(`/survey/${r.id}`);
    else if (r.status === "draft") router.push(`/survey/${r.id}/capture`);
    else router.push(`/survey/${r.id}`);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <T variant="heading" accessibilityRole="header">
            Site Surveys
          </T>
          <T dim numberOfLines={1}>
            {user?.fullName || user?.email}
          </T>
        </View>
        <IconButton icon="log-out-outline" label="Sign out" onPress={doSignOut} tint={color.textDim} />
      </View>

      <View style={s.statusRow}>
        <Badge
          label={online ? "Online" : "Offline — work is saved on this phone"}
          tone={online ? "good" : "warn"}
          icon={online ? "cloud-done-outline" : "cloud-offline-outline"}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 140, gap: space.sm }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color.amber}
            onRefresh={async () => {
              setRefreshing(true);
              await syncPending({ force: true }).catch(() => undefined);
              await load();
              setRefreshing(false);
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <T variant="small" muted style={s.sectionTitle}>
            {section.title.toUpperCase()} · {section.data.length}
          </T>
        )}
        renderItem={({ item }) => (
          <SurveyRow row={item} me={user?.email ?? null} uploading={uploading[item.id]} onPress={() => open(item)} />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="clipboard-outline" size={48} color={color.textMuted} />
            <T dim style={{ textAlign: "center" }}>
              No surveys yet. Start one when you arrive on site — it saves as you go, even with no signal.
            </T>
          </View>
        }
      />

      <View style={[s.bottom, { paddingBottom: insets.bottom + space.sm }]}>
        {waiting.some((w) => w.syncStatus === "error") && online ? (
          <Button
            label="Retry"
            accessibilityHint="Retry uploads now"
            icon="refresh"
            kind="secondary"
            onPress={() => void syncPending({ force: true })}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          testID="new-survey"
          label="Start a survey"
          icon="add"
          onPress={() => router.push("/new-survey")}
          style={{ flex: 1.4 }}
        />
      </View>
    </View>
  );
}

function SurveyRow({
  row,
  me,
  uploading,
  onPress,
}: {
  row: Row;
  me: string | null;
  uploading?: { done: number; total: number };
  onPress: () => void;
}) {
  const someoneElse = !!row.ownerEmail && !!me && row.ownerEmail.toLowerCase() !== me.toLowerCase();
  const install = INSTALL_TYPES.find((t) => t.id === row.installType)?.label;
  let status: React.ReactNode = null;
  if (row.status === "draft") {
    const step = STEPS.find((st) => st.id === row.currentStep);
    status = (
      <T variant="small" dim>
        {step ? `On step ${step.number}: ${step.short}` : "Ready to review"} · saved {timeAgo(row.updatedAt)}
      </T>
    );
  } else if (someoneElse && row.syncStatus !== "synced") {
    status = (
      <T variant="small" dim numberOfLines={2}>
        Uploads when {row.ownerEmail} signs in on this phone
      </T>
    );
  } else if (row.syncStatus === "syncing") {
    status = (
      <T variant="small" style={{ color: color.blue }}>
        Uploading{uploading ? ` · ${uploading.done}/${uploading.total} photos` : "…"}
      </T>
    );
  } else if (row.syncStatus === "error") {
    status = (
      <T variant="small" style={{ color: color.amber }} numberOfLines={2}>
        {row.syncError ?? "Upload failed"}
        {row.nextRetryAt ? ` · retry ${new Date(row.nextRetryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
      </T>
    );
  } else if (row.syncStatus === "pending") {
    status = (
      <T variant="small" dim>
        Queued · {row.uploadedCount}/{row.photoCount} photos uploaded
      </T>
    );
  } else {
    status = (
      <T variant="small" style={{ color: color.green }}>
        In SolarPro · {row.photoCount} photos · {timeAgo(row.updatedAt)}
      </T>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${row.title}. Open`} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
      {row.progress ? (
        <ProgressRing done={row.progress.done} total={row.progress.total} size={52} center="percent" />
      ) : (
        <View style={s.statusIcon}>
          <Ionicons
            name={row.syncStatus === "synced" ? "cloud-done" : row.syncStatus === "error" ? "cloud-offline" : "cloud-upload"}
            size={26}
            color={row.syncStatus === "synced" ? color.green : row.syncStatus === "error" ? color.amber : color.blue}
          />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.title} numberOfLines={1}>
          {row.title}
        </Text>
        {row.address && row.address !== row.title ? (
          <T variant="small" muted numberOfLines={1}>
            {row.address}
          </T>
        ) : null}
        {install ? (
          <T variant="caption" muted>
            {install}
            {row.legacy ? " · older survey" : ""}
          </T>
        ) : null}
        {status}
      </View>
      <Ionicons name="chevron-forward" size={22} color={color.textMuted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.md },
  statusRow: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm },
  sectionTitle: { fontWeight: "800", letterSpacing: 0.6, marginTop: space.md, marginBottom: space.xs },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    minHeight: 80,
  },
  statusIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.surfaceRaised, alignItems: "center", justifyContent: "center" },
  title: { color: color.text, fontSize: 17, fontWeight: "800" },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
});
