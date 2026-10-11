// ============================================================
// The survey: five steps + Review on one screen, with tabs.
// Fields and photo slots come from the blueprint; progress and the
// submit gate come from progress.ts; every change autosaves.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { syncPending } from "../../services/SyncManager";
import { Badge, Button, Card, IconButton, ReasonSheet, Sheet, T } from "../../ui/components";
import { FramingGuide } from "../../ui/FramingGuide";
import { color, radius, space } from "../../ui/theme";
import { STEPS, type SlotDef } from "../blueprint";
import { currentFix, pickFromLibrary, recoverPendingCapture, takePhoto } from "../capture";
import { slotKey, type CapturedPhoto } from "../model";
import { photosForSlot, sectionInstances, surveyReadiness, type RequiredItem } from "../progress";
import { removePhoto, submitSurvey, updatePhoto, type StoredSurvey } from "../repo";
import { useSurveyEditor } from "../useSurveyEditor";
import { FieldInput } from "./FieldInput";
import { SlotTile } from "./SlotTile";
import { StepTabs } from "./StepTabs";

const BLUR_REASONS = ["Best possible in this light", "Label is still readable", "Couldn't get closer"];
const SKIP_REASONS = ["No access", "Customer declined", "Not present at this site", "Unsafe to reach"];

type SlotTarget = { slot: SlotDef; planeId: string | null };

export function CaptureScreen({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ed = useSurveyEditor(surveyId);
  const scroller = React.useRef<ScrollView>(null);

  const [busySlot, setBusySlot] = React.useState<string | null>(null);
  const [blurry, setBlurry] = React.useState<CapturedPhoto | null>(null);
  const [blurReasonOpen, setBlurReasonOpen] = React.useState(false);
  const [help, setHelp] = React.useState<SlotTarget | null>(null);
  const [skip, setSkip] = React.useState<RequiredItem | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Photos can change on the photo screen (markup, retake, delete).
  useFocusEffect(
    React.useCallback(() => {
      void ed.reloadPhotos();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surveyId]),
  );

  // Recover a photo if Android killed the app while the camera was open.
  React.useEffect(() => {
    if (!ed.doc) return;
    void (async () => {
      const recovered = await recoverPendingCapture(surveyId, ed.photos);
      if (recovered) {
        await ed.reloadPhotos();
        if (recovered.blurry) setBlurry(recovered.photo);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(ed.doc)]);

  // Site GPS for the survey record (best effort, once).
  React.useEffect(() => {
    if (!ed.doc || ed.doc.gps || ed.survey?.status === "submitted") return;
    void (async () => {
      const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!perm?.granted) return;
      const fix = await currentFix();
      if (fix.gps) ed.setGps({ lat: fix.gps.lat, lng: fix.gps.lng, accuracy: null });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(ed.doc)]);

  if (ed.notFound) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <T>Survey not found on this phone.</T>
        <Button label="Back to surveys" onPress={() => router.replace("/")} style={{ marginTop: space.lg }} />
      </View>
    );
  }
  if (!ed.doc || !ed.survey) {
    return <View style={s.center} />;
  }

  const doc = ed.doc;
  const readiness = surveyReadiness(doc, ed.photos);
  const overridden = new Set(doc.overrides.map((o) => o.key));
  const locked = ed.survey.status === "submitted";

  const goTo = (target: StoredSurvey["currentStep"]) => {
    ed.setStep(target);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };
  const stepIndex = ed.step === "review" ? STEPS.length : STEPS.findIndex((st) => st.id === ed.step);
  const prev = stepIndex > 0 ? (STEPS[stepIndex - 1]?.id ?? null) : null;
  const next = stepIndex < STEPS.length - 1 ? STEPS[stepIndex + 1].id : stepIndex === STEPS.length - 1 ? "review" : null;

  const capture = async (target: SlotTarget) => {
    if (locked) return;
    const key = slotKey(target.slot.id, target.planeId);
    setBusySlot(key);
    try {
      const res = await takePhoto({ surveyId, slotId: target.slot.id, planeId: target.planeId }, ed.photos);
      if (res.kind === "denied") {
        Alert.alert("Camera blocked", "Allow camera access in Settings to take survey photos.");
        return;
      }
      if (res.kind === "captured") {
        await ed.reloadPhotos();
        if (res.blurry) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setBlurry(res.photo);
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (e) {
      Alert.alert("Photo not saved", e instanceof Error ? e.message : String(e));
    } finally {
      setBusySlot(null);
    }
  };

  const fromLibrary = async (target: SlotTarget) => {
    const existing = photosForSlot(ed.photos, target.slot.id, target.planeId).filter((p) => p.qualityStatus !== "rejected");
    const room = (target.slot.max ?? 1) - existing.length;
    if (room <= 0) return;
    const filed = await pickFromLibrary({ surveyId, slotId: target.slot.id, planeId: target.planeId }, ed.photos, room);
    await ed.reloadPhotos();
    const firstBlurry = filed.find((f) => f.blurry);
    if (firstBlurry) setBlurry(firstBlurry.photo);
  };

  const openPhoto = (p: CapturedPhoto) => router.push(`/survey/${surveyId}/photo/${p.id}`);

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      await ed.flush();
      await submitSurvey(surveyId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      syncPending({ force: true }).catch(() => undefined);
      router.replace(`/survey/${surveyId}`);
    } catch (e) {
      Alert.alert("Couldn't submit", e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    const step = STEPS.find((st) => st.id === ed.step)!;
    const instances = sectionInstances(doc, step);
    const sp = readiness.steps.find((x) => x.step.id === step.id)!;
    const planeSectionCount = instances.filter((i) => i.section.repeat === "plane").length;
    return (
      <View style={{ gap: space.lg }}>
        <View>
          <T variant="caption" muted>
            STEP {step.number} OF 5
          </T>
          <T variant="heading" accessibilityRole="header">
            {step.title}
          </T>
          <T dim>
            {sp.total - sp.done === 0 ? "Everything required here is done." : `${sp.total - sp.done} required item${sp.total - sp.done === 1 ? "" : "s"} left in this step.`}
          </T>
          {step.id === "project_arrival" ? (
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm, flexWrap: "wrap" }}>
              <Badge
                icon="time-outline"
                label={`Arrived ${new Date(doc.arrivedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
              />
              <Badge icon="location-outline" label={doc.gps ? "Site GPS saved" : "Getting site GPS…"} tone={doc.gps ? "good" : "neutral"} />
            </View>
          ) : null}
        </View>

        {instances.map((inst, idx) => {
          const secProg = sp.sections.find((x) => x.instance.section.id === inst.section.id && x.instance.planeId === inst.planeId);
          const isLastPlane =
            inst.section.repeat === "plane" &&
            instances.filter((i) => i.section.repeat === "plane").slice(-1)[0] === inst;
          return (
            <React.Fragment key={`${inst.section.id}:${inst.planeId ?? ""}:${idx}`}>
              <Card style={{ gap: space.md }}>
                <View style={s.sectionHead}>
                  <T variant="title" style={{ flex: 1 }} accessibilityRole="header">
                    {inst.planeId ? `Roof plane ${inst.planeId}` : inst.section.title}
                  </T>
                  {secProg && secProg.total > 0 ? (
                    <Badge
                      label={`${secProg.done}/${secProg.total} required`}
                      tone={secProg.done === secProg.total ? "good" : "warn"}
                    />
                  ) : null}
                  {inst.planeId && planeSectionCount > 1 && !locked ? (
                    <IconButton
                      icon="trash-outline"
                      label={`Remove roof plane ${inst.planeId}`}
                      tint={color.red}
                      onPress={() =>
                        Alert.alert(`Remove plane ${inst.planeId}?`, "Its answers are removed. Photos stay on the phone until you delete them.", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Remove", style: "destructive", onPress: () => ed.removePlane(inst.planeId!) },
                        ])
                      }
                    />
                  ) : null}
                </View>

                {inst.fields.map((f) => (
                  <View key={f.id} pointerEvents={locked ? "none" : "auto"}>
                    <FieldInput field={f} value={inst.answers[f.id]} onChange={(v) => ed.setAnswer(f.id, v, inst.planeId)} />
                  </View>
                ))}

                {inst.slots.length ? (
                  <View style={{ gap: space.md }}>
                    {inst.slots.map((slot) => {
                      const key = slotKey(slot.id, inst.planeId);
                      return (
                        <View key={key} style={{ opacity: busySlot && busySlot !== key ? 0.6 : 1 }}>
                          <SlotTile
                            slot={slot}
                            photos={photosForSlot(ed.photos, slot.id, inst.planeId)}
                            overridden={overridden.has(key)}
                            onCapture={() => void capture({ slot, planeId: inst.planeId })}
                            onOpen={openPhoto}
                            onHelp={() => setHelp({ slot, planeId: inst.planeId })}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
              {isLastPlane && !locked ? (
                <Button
                  label="Add another roof plane"
                  icon="add-circle-outline"
                  kind="secondary"
                  onPress={() => {
                    const id = ed.addPlane();
                    void Haptics.selectionAsync();
                    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
                    return id;
                  }}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  const renderReview = () => (
    <View style={{ gap: space.lg }}>
      <View>
        <T variant="caption" muted>
          FINISH
        </T>
        <T variant="heading" accessibilityRole="header">
          Review & submit
        </T>
        <T dim>
          {readiness.ready
            ? "Everything required is captured. Submit to upload to SolarPro."
            : "Fill or skip (with a reason) each item below to submit."}
        </T>
      </View>

      {readiness.steps.map((sp) => {
        const missing = sp.items.filter((i) => !i.done && !i.overridden);
        const skipped = sp.items.filter((i) => !i.done && i.overridden);
        const blurry = sp.flagged;
        return (
          <Card key={sp.step.id} style={{ gap: space.sm }}>
            <Pressable
              onPress={() => goTo(sp.step.id)}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${sp.step.title}`}
              style={s.reviewHead}
            >
              <Ionicons
                name={missing.length ? "alert-circle" : "checkmark-circle"}
                size={26}
                color={missing.length ? color.amber : color.green}
              />
              <T variant="title" style={{ flex: 1 }}>
                {sp.step.number}. {sp.step.title}
              </T>
              <T dim>
                {sp.done}/{sp.total}
              </T>
              <Ionicons name="chevron-forward" size={22} color={color.textDim} />
            </Pressable>
            {missing.map((m) => (
              <View key={m.key} style={s.reviewRow}>
                <Ionicons name={m.kind === "slot" ? "camera-outline" : "create-outline"} size={20} color={color.amber} />
                <T style={{ flex: 1 }}>{m.label}</T>
                {!locked ? (
                  <Button label="Skip…" kind="ghost" onPress={() => setSkip(m)} style={{ minHeight: 44 }} />
                ) : null}
              </View>
            ))}
            {skipped.map((m) => (
              <View key={m.key} style={s.reviewRow}>
                <Ionicons name="remove-circle" size={20} color={color.textMuted} />
                <View style={{ flex: 1 }}>
                  <T dim>{m.label}</T>
                  <T variant="caption" muted>
                    Skipped: {doc.overrides.find((o) => o.key === m.key)?.reason}
                  </T>
                </View>
                {!locked ? (
                  <Button label="Undo" kind="ghost" onPress={() => ed.setOverride(m.key, null)} style={{ minHeight: 44 }} />
                ) : null}
              </View>
            ))}
            {blurry.map((p) => (
              <Pressable key={p.id} onPress={() => openPhoto(p)} style={s.reviewRow} accessibilityRole="button" accessibilityLabel="Open blurry photo">
                <Ionicons name="eye-off-outline" size={20} color={color.amber} />
                <T style={{ flex: 1 }}>
                  Blurry photo kept{p.notes ? `: ${p.notes}` : " — add a reason or retake"}
                </T>
                <Ionicons name="chevron-forward" size={20} color={color.textDim} />
              </Pressable>
            ))}
          </Card>
        );
      })}

      <Card style={{ gap: space.sm }}>
        <T variant="title">Notes for the design team</T>
        <View pointerEvents={locked ? "none" : "auto"}>
          <FieldInput
            field={{ id: "notes", label: "Survey notes", kind: "multiline", placeholder: "Anything the designer should know" }}
            value={doc.notes}
            onChange={(v) => ed.setNotes(typeof v === "string" ? v : "")}
          />
        </View>
      </Card>

      {!locked ? (
        <Button
          testID="submit-survey"
          label={readiness.ready ? "Submit survey" : `${readiness.missing.length + readiness.unexplainedBlurry.length} items left`}
          icon={readiness.ready ? "cloud-upload-outline" : undefined}
          onPress={doSubmit}
          disabled={!readiness.ready}
          busy={submitting}
        />
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.top, { paddingTop: insets.top + space.xs }]}>
        <View style={s.titleRow}>
          <IconButton icon="chevron-back" label="Back to surveys" onPress={() => router.replace("/")} />
          <View style={{ flex: 1 }}>
            <T variant="title" numberOfLines={1}>
              {doc.project.projectName || (typeof doc.answers.site_address === "string" ? doc.answers.site_address : "") || "Site survey"}
            </T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons
                name={ed.saveState === "error" ? "warning" : ed.saveState === "saving" ? "sync" : "checkmark-done"}
                size={14}
                color={ed.saveState === "error" ? color.red : color.textMuted}
              />
              <T variant="caption" muted>
                {locked ? "Submitted · read only" : ed.saveState === "error" ? "Not saved — retrying" : ed.saveState === "saving" ? "Saving…" : "Saved on this phone"}
              </T>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", marginRight: space.sm }}>
            <T variant="title" style={{ color: readiness.ready ? color.green : color.amber }}>
              {Math.round((readiness.total ? readiness.done / readiness.total : 1) * 100)}%
            </T>
          </View>
        </View>
        <StepTabs readiness={readiness} current={ed.step} onSelect={goTo} />
      </View>

      <ScrollView
        ref={scroller}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {ed.step === "review" ? renderReview() : renderStep()}
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + space.sm }]}>
        <Button
          label="Back"
          icon="arrow-back"
          kind="secondary"
          onPress={() => (prev ? goTo(prev) : router.replace("/"))}
          style={{ flex: 1 }}
        />
        {next ? (
          <Button
            label={next === "review" ? "Review" : `Next: ${STEPS.find((x) => x.id === next)!.short}`}
            icon="arrow-forward"
            onPress={() => goTo(next)}
            style={{ flex: 1.6 }}
          />
        ) : null}
      </View>

      <Sheet visible={!!help} onClose={() => setHelp(null)} title={help?.slot.label ?? ""}>
        {help ? (
          <View style={{ gap: space.md, alignItems: "center" }}>
            <View style={s.bigGuide}>
              <FramingGuide id={help.slot.guide} size={260} />
            </View>
            <T style={{ alignSelf: "stretch" }}>{help.slot.hint}</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignSelf: "stretch" }}>
              {help.slot.usage.map((u) => (
                <Badge key={u} label={u} tone="info" />
              ))}
            </View>
            {!locked ? (
              <View style={{ flexDirection: "row", gap: space.sm, alignSelf: "stretch" }}>
                <Button
                  label="From library"
                  icon="images-outline"
                  kind="secondary"
                  style={{ flex: 1 }}
                  onPress={() => {
                    const target = help;
                    setHelp(null);
                    void fromLibrary(target);
                  }}
                />
                <Button
                  label="Take photo"
                  icon="camera"
                  style={{ flex: 1 }}
                  onPress={() => {
                    const target = help;
                    setHelp(null);
                    void capture(target);
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!blurry && !blurReasonOpen} onClose={() => setBlurry(null)} title="This photo looks blurry">
        {blurry ? (
          <View style={{ gap: space.md }}>
            <T dim>
              Designers need to read labels and edges. Retake it now while you’re here, or keep it and say why.
            </T>
            <Button
              label="Retake"
              icon="camera-reverse"
              onPress={async () => {
                const p = blurry;
                setBlurry(null);
                // Replace, don't keep: the blurry original is deleted.
                await removePhoto(p);
                await ed.reloadPhotos();
                const res = await takePhoto(
                  { surveyId, slotId: p.slotId, planeId: p.planeId, retakeOf: { photoId: p.id, reason: "Blurry" } },
                  ed.photos,
                );
                await ed.reloadPhotos();
                if (res.kind === "captured" && res.blurry) setBlurry(res.photo);
              }}
            />
            <Button label="Keep it…" kind="secondary" onPress={() => setBlurReasonOpen(true)} />
          </View>
        ) : null}
      </Sheet>

      <ReasonSheet
        visible={blurReasonOpen}
        title="Keep blurry photo"
        prompt="Why keep it? This note goes to the design team with the photo."
        suggestions={BLUR_REASONS}
        confirmLabel="Keep photo"
        onCancel={() => setBlurReasonOpen(false)}
        onConfirm={async (reason) => {
          if (blurry) await updatePhoto(blurry.id, { notes: reason });
          setBlurReasonOpen(false);
          setBlurry(null);
          await ed.reloadPhotos();
        }}
      />

      <ReasonSheet
        visible={!!skip}
        title={`Skip “${skip?.label ?? ""}”`}
        prompt="Required for the planset. Say why it can't be captured — the designer will see this."
        suggestions={SKIP_REASONS}
        confirmLabel="Skip with this reason"
        onCancel={() => setSkip(null)}
        onConfirm={(reason) => {
          if (skip) ed.setOverride(skip.key, reason);
          setSkip(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.bg, padding: space.xl },
  top: { backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.border },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingRight: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: space.xs,
  },
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
  bigGuide: { backgroundColor: color.bg, borderRadius: radius.md, padding: space.md },
});
