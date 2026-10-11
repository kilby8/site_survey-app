import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { FramingGuide } from "../../ui/FramingGuide";
import { color, radius, space } from "../../ui/theme";
import type { SlotDef } from "../blueprint";
import type { CapturedPhoto } from "../model";
import { absPath } from "../repo";

/**
 * One photo slot. Empty: shows the framing guide; one tap opens the camera.
 * Filled: shows the photo(s); tap one to view, mark up or retake.
 */
export function SlotTile({
  slot,
  photos,
  overridden,
  onCapture,
  onOpen,
  onHelp,
}: {
  slot: SlotDef;
  photos: CapturedPhoto[];
  overridden: boolean;
  onCapture: () => void;
  onOpen: (photo: CapturedPhoto) => void;
  onHelp: () => void;
}) {
  const max = slot.max ?? 1;
  const usable = photos.filter((p) => p.qualityStatus !== "rejected");
  const filled = usable.length > 0;
  const canAdd = usable.length < max;
  const flagged = usable.some((p) => p.qualityStatus === "pending_review");

  const status = filled ? (flagged ? "flagged" : "done") : overridden ? "skipped" : slot.required ? "needed" : "optional";
  const statusUi = {
    done: { icon: "checkmark-circle" as const, tint: color.green, text: "Done" },
    flagged: { icon: "alert-circle" as const, tint: color.amber, text: "Blurry" },
    skipped: { icon: "remove-circle" as const, tint: color.textMuted, text: "Skipped" },
    needed: { icon: "ellipse-outline" as const, tint: color.amber, text: "Required" },
    optional: { icon: "ellipse-outline" as const, tint: color.textMuted, text: "Optional" },
  }[status];

  return (
    <View style={[s.tile, status === "needed" && s.tileNeeded]}>
      <View style={s.head}>
        <Ionicons name={statusUi.icon} size={20} color={statusUi.tint} />
        <Text style={s.label} numberOfLines={2}>
          {slot.label}
        </Text>
        <Pressable
          onPress={onHelp}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`How to shoot ${slot.label}`}
          style={s.help}
        >
          <Ionicons name="help-circle-outline" size={22} color={color.textDim} />
        </Pressable>
      </View>

      {filled ? (
        <View style={s.thumbs}>
          {usable.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => onOpen(p)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${slot.label} photo${p.qualityStatus === "pending_review" ? ", flagged blurry" : ""}. Open`}
              style={s.thumbWrap}
            >
              <Image source={{ uri: absPath(p.annotatedRelPath ?? p.relPath) }} style={s.thumb} />
              {p.qualityStatus === "pending_review" ? (
                <View style={[s.flag, { backgroundColor: color.amber }]}>
                  <Ionicons name="eye-off" size={14} color={color.onAmber} />
                </View>
              ) : null}
              {p.annotatedRelPath ? (
                <View style={[s.flag, { right: undefined, left: 4, backgroundColor: color.blue }]}>
                  <Ionicons name="brush" size={12} color={color.bg} />
                </View>
              ) : null}
            </Pressable>
          ))}
          {canAdd ? (
            <Pressable
              onPress={onCapture}
              accessibilityRole="button"
              accessibilityLabel={`Add another ${slot.label} photo`}
              style={[s.thumbWrap, s.add]}
            >
              <Ionicons name="add" size={28} color={color.amber} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={onCapture}
          accessibilityRole="button"
          accessibilityLabel={`Take ${slot.label} photo. ${slot.hint}`}
          style={({ pressed }) => [s.empty, pressed && { opacity: 0.75 }]}
        >
          <FramingGuide id={slot.guide} size={112} />
          <View style={s.shoot}>
            <Ionicons name="camera" size={20} color={color.onAmber} />
            <Text style={s.shootText}>Take photo</Text>
          </View>
        </Pressable>
      )}

      <Text style={s.hint} numberOfLines={2}>
        {slot.hint}
        {max > 1 ? `  ·  up to ${max}` : ""}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border,
    padding: space.md,
    gap: space.sm,
  },
  tileNeeded: { borderColor: "#6B4E0E" },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 32 },
  label: { flex: 1, color: color.text, fontSize: 17, fontWeight: "700" },
  help: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    padding: space.sm,
    minHeight: 100,
  },
  shoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: color.amber,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    minHeight: 52,
  },
  shootText: { color: color.onAmber, fontSize: 17, fontWeight: "800" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  thumbWrap: { width: 96, height: 96, borderRadius: radius.sm, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  add: {
    borderWidth: 1.5,
    borderColor: color.amber,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  flag: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { color: color.textMuted, fontSize: 14, lineHeight: 19 },
});
