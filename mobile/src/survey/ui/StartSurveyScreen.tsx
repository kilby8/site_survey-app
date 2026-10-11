// ============================================================
// Start a survey: find the SolarPro project by name or address (works
// offline from the cached index), or start without one; pick the install
// type; go. A SolarPro handoff link skips straight to the survey.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchHandoffToken } from "../../api/client";
import { useAppBootstrap } from "../../context/AppBootstrapContext";
import { useAuth } from "../../context/AuthContext";
import { isOnline } from "../../services/SyncManager";
import { Button, Card, IconButton, Input, T } from "../../ui/components";
import { color, radius, space } from "../../ui/theme";
import { INSTALL_TYPES, type AnswerValue, type InstallType } from "../blueprint";
import { newSurveyDoc, type ProjectLink } from "../model";
import { loadProjectIndex, refreshProjectIndex, searchProjects, type IndexedProject, type ProjectIndex } from "../projectIndex";
import { createSurveyDraft, findDraftForProject } from "../repo";

const NO_PROJECT = "__none__";

/** Map handoff metadata (legacy category shapes) onto blueprint answers. */
export function answersFromHandoff(meta: Record<string, unknown> | null): Record<string, AnswerValue> {
  if (!meta) return {};
  const out: Record<string, AnswerValue> = {};
  const keep = [
    "soil_type", "slope_degrees", "trenching_path", "vegetation_clearing", "perimeter_length_ft", "lower_shade_risk",
    "foundation_type", "bifacial_surface", "rafter_size", "rafter_spacing", "roof_age_years", "parcel_number",
    "utility_having_jurisdiction", "municipality_having_jurisdiction", "snow_load_lbs_sqft", "seismic_rating",
    "building_height_ft", "max_wind_speed_mph", "system_kw",
  ];
  for (const k of keep) {
    const v = meta[k];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  if (typeof meta.nec_code_year === "number") out.nec_code_year = String(meta.nec_code_year);
  if (typeof meta.wind_exposure_category === "string") out.wind_exposure = meta.wind_exposure_category;
  return out;
}

export function StartSurveyScreen({ handoffToken }: { handoffToken?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { deviceId } = useAppBootstrap();

  const [index, setIndex] = React.useState<ProjectIndex>({ updatedAt: null, projects: [] });
  const [loading, setLoading] = React.useState<{ done: number; total: number } | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<IndexedProject | typeof NO_PROJECT | null>(null);
  const [installType, setInstallType] = React.useState<InstallType | null>(null);
  const [inspector, setInspector] = React.useState(user?.fullName ?? "");
  const [starting, setStarting] = React.useState(false);
  const [handoffBusy, setHandoffBusy] = React.useState(!!handoffToken);

  const refresh = React.useCallback(async () => {
    if (!isOnline()) return;
    setLoadError(null);
    setLoading({ done: 0, total: 0 });
    try {
      setIndex(await refreshProjectIndex((done, total) => setLoading({ done, total })));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load SolarPro projects");
    } finally {
      setLoading(null);
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      const cached = await loadProjectIndex();
      setIndex(cached);
      const stale = !cached.updatedAt || Date.now() - Date.parse(cached.updatedAt) > 10 * 60_000;
      if (stale) void refresh();
    })();
  }, [refresh]);

  // SolarPro handoff link: create the survey from its prefill and go.
  React.useEffect(() => {
    if (!handoffToken) return;
    void (async () => {
      try {
        const h = await fetchHandoffToken(handoffToken);
        // Opening the same SolarPro link twice resumes the survey already started.
        const linkedProject = h.solarpro_project_id ?? h.project_id ?? null;
        const existing = linkedProject ? await findDraftForProject(linkedProject) : null;
        if (existing) {
          router.replace(`/survey/${existing}/capture`);
          return;
        }
        const type = (INSTALL_TYPES.find((t) => t.id === h.category_id)?.id ?? "roof_mount") as InstallType;
        const project: ProjectLink = {
          solarproProjectId: h.solarpro_project_id ?? h.project_id ?? null,
          solarproClientId: h.solarpro_org_id ?? null,
          projectName: h.project_name ?? h.site_name ?? "",
          clientName: null,
          handoff: { solarproUserId: h.solarpro_user_id, solarproEmail: h.solarpro_email },
        };
        const doc = newSurveyDoc({
          installType: type,
          project,
          inspectorName: h.inspector_name || user?.fullName || "",
          siteAddress: h.site_address ?? undefined,
        });
        doc.answers = { ...doc.answers, ...answersFromHandoff(h.metadata) };
        doc.extra = h.metadata ?? {};
        doc.notes = h.notes ?? "";
        if (h.latitude !== null && h.longitude !== null) doc.gps = { lat: h.latitude, lng: h.longitude, accuracy: h.gps_accuracy };
        const id = await createSurveyDraft({ doc, deviceId, ownerEmail: user?.email ?? null });
        router.replace(`/survey/${id}/capture`);
      } catch (e) {
        setHandoffBusy(false);
        Alert.alert("SolarPro link didn't open", `${e instanceof Error ? e.message : String(e)}\n\nPick the project below instead.`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffToken]);

  const results = React.useMemo(() => searchProjects(index.projects, query), [index.projects, query]);

  const choose = (p: IndexedProject | typeof NO_PROJECT) => {
    setPicked(p);
    if (p !== NO_PROJECT && p.installType) setInstallType(p.installType);
  };

  const start = async () => {
    if (!picked || !installType) return;
    if (picked !== NO_PROJECT) {
      const existing = await findDraftForProject(picked.id);
      if (existing) {
        Alert.alert("Survey already started", `There's an unfinished survey for ${picked.name} on this phone.`, [
          { text: "Resume it", onPress: () => router.replace(`/survey/${existing}/capture`) },
          { text: "Start a new one", style: "destructive", onPress: () => void create() },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }
    }
    await create();
  };

  const create = async () => {
    if (!picked || !installType) return;
    setStarting(true);
    try {
      const project: ProjectLink =
        picked === NO_PROJECT
          ? { solarproProjectId: null, solarproClientId: null, projectName: "", clientName: null }
          : { solarproProjectId: picked.id, solarproClientId: picked.clientId, projectName: picked.name, clientName: picked.clientName };
      const doc = newSurveyDoc({
        installType,
        project,
        inspectorName: inspector.trim() || user?.fullName || "",
        siteAddress: picked === NO_PROJECT ? undefined : picked.address || undefined,
      });
      const id = await createSurveyDraft({ doc, deviceId, ownerEmail: user?.email ?? null });
      router.replace(`/survey/${id}/capture`);
    } catch (e) {
      setStarting(false);
      Alert.alert("Couldn't start the survey", e instanceof Error ? e.message : String(e));
    }
  };

  if (handoffBusy) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={color.amber} size="large" />
        <T style={{ marginTop: space.md }}>Opening the SolarPro project…</T>
      </View>
    );
  }

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <View>
        <T variant="heading" accessibilityRole="header">
          New survey
        </T>
        <T dim>Find the SolarPro project, or start without one and link it in the office.</T>
      </View>
      <View>
        <Input
          label="Search projects by name or address"
          placeholder="Name, client or street"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        <View style={s.indexRow}>
          {loading ? (
            <>
              <ActivityIndicator size="small" color={color.amber} />
              <T variant="caption" muted>
                Loading projects{loading.total ? ` (${loading.done}/${loading.total} clients)` : "…"}
              </T>
            </>
          ) : (
            <>
              <T variant="caption" muted style={{ flex: 1 }}>
                {loadError
                  ? loadError
                  : index.updatedAt
                    ? `${index.projects.length} projects · updated ${new Date(index.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : isOnline()
                      ? "No projects loaded yet"
                      : "Offline — no saved project list yet"}
              </T>
              <IconButton icon="refresh" label="Reload projects from SolarPro" onPress={() => void refresh()} size={20} tint={color.amber} />
            </>
          )}
        </View>
      </View>
      <ProjectRow
        title="Start without a project"
        subtitle="Link it to a SolarPro project later"
        icon="add-circle-outline"
        selected={picked === NO_PROJECT}
        onPress={() => choose(NO_PROJECT)}
      />
    </View>
  );

  const footer = (
    <View style={{ gap: space.lg, paddingTop: space.lg }}>
      <Card style={{ gap: space.md }}>
        <T variant="title">Install type</T>
        <View style={s.typeGrid}>
          {INSTALL_TYPES.map((t) => {
            const on = installType === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setInstallType(t.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.label}. ${t.hint}`}
                style={[s.type, on && s.typeOn]}
              >
                <Text style={[s.typeLabel, on && { color: color.onAmber }]}>{t.label}</Text>
                <Text style={[s.typeHint, on && { color: color.onAmber }]}>{t.hint}</Text>
              </Pressable>
            );
          })}
        </View>
        <T variant="small" dim style={{ fontWeight: "700" }}>
          Surveyor
        </T>
        <Input label="Surveyor name" value={inspector} onChangeText={setInspector} placeholder="Your name" />
      </Card>
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.top}>
        <IconButton icon="close" label="Cancel" onPress={() => router.back()} />
      </View>
      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          query ? (
            <T muted style={{ paddingVertical: space.md }}>
              No project matches “{query}”.
            </T>
          ) : null
        }
        renderItem={({ item }) => (
          <ProjectRow
            title={item.name}
            subtitle={[item.clientName !== item.name ? item.clientName : null, item.address].filter(Boolean).join(" · ") || "No address on file"}
            icon="briefcase-outline"
            selected={picked !== NO_PROJECT && picked?.id === item.id}
            onPress={() => choose(item)}
          />
        )}
      />
      <View style={[s.bottom, { paddingBottom: insets.bottom + space.sm }]}>
        <Button
          testID="start-survey"
          label={!picked ? "Pick a project" : !installType ? "Pick an install type" : "Start survey"}
          icon={picked && installType ? "arrow-forward" : undefined}
          disabled={!picked || !installType}
          busy={starting}
          onPress={() => void start()}
        />
      </View>
    </View>
  );
}

function ProjectRow({
  title,
  subtitle,
  icon,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${subtitle}`}
      style={[s.row, selected && s.rowOn]}
    >
      <Ionicons name={selected ? "checkmark-circle" : icon} size={26} color={selected ? color.amber : color.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.rowSub} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.bg },
  top: { flexDirection: "row", paddingHorizontal: space.xs },
  indexRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40, marginTop: space.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  rowOn: { borderColor: color.amber, backgroundColor: "#17150B" },
  rowTitle: { color: color.text, fontSize: 17, fontWeight: "800" },
  rowSub: { color: color.textMuted, fontSize: 15, marginTop: 2 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  type: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.inputBorder,
    backgroundColor: color.input,
    padding: space.md,
    justifyContent: "center",
  },
  typeOn: { backgroundColor: color.amber, borderColor: color.amber },
  typeLabel: { color: color.text, fontSize: 17, fontWeight: "800" },
  typeHint: { color: color.textMuted, fontSize: 13, marginTop: 2 },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
});
