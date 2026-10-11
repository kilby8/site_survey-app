import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ProgressRing } from "../../ui/components";
import { color, space } from "../../ui/theme";
import type { StoredSurvey } from "../repo";
import type { SurveyReadiness } from "../progress";

/** Steps 1–5 + Review, each with a ring showing required items left. */
export function StepTabs({
  readiness,
  current,
  onSelect,
}: {
  readiness: SurveyReadiness;
  current: StoredSurvey["currentStep"];
  onSelect: (s: StoredSurvey["currentStep"]) => void;
}) {
  const scroller = React.useRef<ScrollView>(null);
  const tabs = [
    ...readiness.steps.map((sp) => ({ id: sp.step.id as StoredSurvey["currentStep"], label: sp.step.short, n: `${sp.step.number}`, done: sp.done, total: sp.total })),
    { id: "review" as const, label: "Review", n: "✓", done: readiness.done, total: readiness.total },
  ];
  const index = tabs.findIndex((t) => t.id === current);
  React.useEffect(() => {
    scroller.current?.scrollTo({ x: Math.max(0, index * 104 - 80), animated: true });
  }, [index]);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.row}
      accessibilityRole="tablist"
    >
      {tabs.map((t) => {
        const on = t.id === current;
        return (
          <Pressable
            key={t.id}
            onPress={() => onSelect(t.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t.label}. ${t.total - t.done} required left`}
            style={[s.tab, on && s.tabOn]}
          >
            <ProgressRing done={t.done} total={t.total} size={36} stroke={4} />
            <View>
              <Text style={s.num}>{t.id === "review" ? "Finish" : `Step ${t.n}`}</Text>
              <Text style={[s.label, on && { color: color.amber }]}>{t.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: space.md, gap: space.sm, paddingVertical: space.sm },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  tabOn: { borderColor: color.amber, backgroundColor: "#1A1A0F" },
  num: { color: color.textMuted, fontSize: 12, fontWeight: "700" },
  label: { color: color.text, fontSize: 15, fontWeight: "800" },
});
