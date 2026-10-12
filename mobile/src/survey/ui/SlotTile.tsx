import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { FramingGuide } from "../../ui/FramingGuide";
import { color, radius, space } from "../../ui/theme";
import type { SlotDef } from "../blueprint";
import { flagLabels } from "../quality";
import type { CapturedPhoto } from "../model";
import { absPath } from "../repo";

/**
 * One photo slot, sized for a two-column grid. Empty: the framing guide;
 * one tap opens the guided camera. Filled: the photo (tap to view, mark
 * up or retake), with a "+" when the slot takes more than one.
 */
export function SlotTile({
  slot,
  photos,
  overridden,
  highlighted,
  onCapture,
  onOpen,
  onHelp,
}: {
  slot: SlotDef;
  photos: CapturedPhoto[];
  overridden: boolean;
  highlighted?: boolean;
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
  const ui = {
    done: { icon: "checkmark-circle" as const, tint: color.green, text: "Done" },
    flagged: { icon: "alert-circle" as const, tint: color.amber, text: "Check photo" },
    skipped: { icon: "remove-circle" as const, tint: color.textMuted, text: "Skipped" },
    needed: { icon: "ellipse-outline" as const, tint: color.amber, text: "Required" },
    optional: { icon: "ellipse-outline" as const, tint: color.textMuted, text: "Optional" },
  }[status];

  const first = usable[0];

  return (
    <View style={[s.tile, status === "needed" && s.needed, highlighted && s.highlight]}>
      <Pressable
        onPress={() => (first ? onOpen(first) : onCapture())}
        accessibilityRole="button"
        accessibilityLabel={
          first
            ? `${slot.label}: ${ui.text}. Open photo${first.crew?.creatorName ? ` taken by ${first.crew.creatorName}` : ""}${flagged ? `, flagged ${flagLabels(first.qualityFlags?.length ? first.qualityFlags : ["blurry"])}` : ""}`
            : `Take ${slot.label} photo. ${slot.hint}`
        }
        style={({ pressed }) => [s.media, pressed && { opacity: 0.8 }]}
      >
        {first ? (
          <Image source={{ uri: absPath(first.annotatedRelPath ?? first.relPath) }} style={s.photo} />
        ) : (
          <View style={s.guide}>
            <FramingGuide id={slot.guide} size={120} />
            <View style={s.cam}>
              <Ionicons name="camera" size={18} color={color.onAmber} />
            </View>
          </View>
        )}
        {first && usable.length > 1 ? (
          <View style={s.count}>
            <Text style={s.countText}>
              {usable.length}/{max}
            </Text>
          </View>
        ) : null}
        {first?.crew?.creatorName ? (
          <View style={s.by} accessibilityElementsHidden>
            <Text style={s.byText} numberOfLines={1}>
              {first.crew.creatorName.split(" ")[0]}
            </Text>
          </View>
        ) : null}
        {first?.annotatedRelPath ? (
          <View style={[s.chip, { backgroundColor: color.blue }]}>
            <Ionicons name="brush" size={12} color={color.bg} />
          </View>
        ) : null}
      </Pressable>

      {usable.length > 1 ? (
        <View style={s.strip}>
          {usable.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => onOpen(p)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${slot.label} photo ${i + 1} of ${usable.length}. Open`}
              style={[s.mini, p.qualityStatus === "pending_review" && { borderColor: color.amber }]}
            >
              <Image source={{ uri: absPath(p.annotatedRelPath ?? p.relPath) }} style={s.photo} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={s.foot}>
        <Ionicons name={ui.icon} size={18} color={ui.tint} style={{ marginTop: 2 }} />
        <Text style={s.label} numberOfLines={2}>
          {slot.label}
          {!slot.required ? <Text style={s.optional}> · optional</Text> : null}
        </Text>
        <Pressable onPress={onHelp} accessibilityRole="button" accessibilityLabel={`How to shoot ${slot.label}, and more options`} style={s.help}>
          <Ionicons name="help-circle-outline" size={22} color={color.textDim} />
        </Pressable>
      </View>

      {filled && canAdd ? (
        <Pressable onPress={onCapture} accessibilityRole="button" accessibilityLabel={`Add another ${slot.label} photo`} style={s.action}>
          <Ionicons name="add" size={20} color={color.amber} />
          <Text style={s.actionText}>
            Add another ({usable.length}/{max})
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border,
    overflow: "hidden",
  },
  needed: { borderColor: "#6B4E0E" },
  highlight: { borderColor: color.amber, borderWidth: 3 },
  media: { height: 118, backgroundColor: color.bg },
  photo: { width: "100%", height: "100%" },
  guide: { flex: 1, alignItems: "center", justifyContent: "center" },
  cam: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { position: "absolute", right: 6, top: 6, backgroundColor: color.overlay, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { color: color.text, fontWeight: "800", fontSize: 13 },
  by: { position: "absolute", left: 6, bottom: 6, maxWidth: "70%", backgroundColor: color.overlay, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  byText: { color: color.text, fontWeight: "700", fontSize: 12 },
  chip: { position: "absolute", left: 6, top: 6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  strip: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: space.sm, paddingTop: space.sm },
  mini: { width: 48, height: 48, borderRadius: 6, overflow: "hidden", borderWidth: 2, borderColor: color.border },
  foot: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingLeft: space.sm, paddingTop: space.xs, minHeight: 48 },
  label: { flex: 1, color: color.text, fontSize: 16, fontWeight: "800", lineHeight: 21, paddingTop: 2 },
  optional: { color: color.textMuted, fontWeight: "600" },
  action: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: space.sm, borderTopWidth: 1, borderTopColor: color.border },
  actionText: { color: color.amber, fontWeight: "800", fontSize: 15 },
  help: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
