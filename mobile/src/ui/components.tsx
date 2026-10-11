// ============================================================
// Shared UI building blocks. Every control has an accessibility
// label/role and a touch target of at least 48 pt.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { color, radius, space, TOUCH, type } from "./theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

// ── Text ─────────────────────────────────────────────────────────

export function T({
  variant = "body",
  dim,
  muted,
  style,
  children,
  ...rest
}: {
  variant?: keyof typeof type;
  dim?: boolean;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
  accessibilityRole?: "header" | "text";
}) {
  return (
    <Text
      style={[type[variant], { color: muted ? color.textMuted : dim ? color.textDim : color.text }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

// ── Button ───────────────────────────────────────────────────────

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  kind = "primary",
  icon,
  disabled,
  busy,
  style,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}) {
  const palette = {
    primary: { bg: color.amber, fg: color.onAmber, border: color.amber },
    secondary: { bg: color.surfaceRaised, fg: color.text, border: color.borderStrong },
    ghost: { bg: "transparent", fg: color.amber, border: "transparent" },
    danger: { bg: color.redBg, fg: color.red, border: color.redBorder },
  }[kind];
  const inactive = disabled || busy;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={22} color={palette.fg} /> : null}
          <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tint = color.text,
  size = 24,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tint?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }, style]}
    >
      <Ionicons name={icon} size={size} color={tint} />
    </Pressable>
  );
}

// ── Layout ───────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  icon?: IconName;
}) {
  const t = {
    neutral: { bg: color.surfaceRaised, fg: color.textDim, border: color.border },
    good: { bg: color.greenBg, fg: color.green, border: color.greenBorder },
    warn: { bg: "#2B2006", fg: color.amber, border: "#6B4E0E" },
    bad: { bg: color.redBg, fg: color.red, border: color.redBorder },
    info: { bg: color.blueBg, fg: color.blue, border: "#24467F" },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      {icon ? <Ionicons name={icon} size={14} color={t.fg} /> : null}
      <Text style={[type.caption, { color: t.fg, fontWeight: "700" }]}>{label}</Text>
    </View>
  );
}

/** Ring showing done/total. Full ring turns green. */
export function ProgressRing({
  done,
  total,
  size = 44,
  stroke = 5,
  label,
  center = "remaining",
}: {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
  label?: string;
  /** What to print inside: items left, or percent done. */
  center?: "remaining" | "percent";
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total === 0 ? 1 : Math.min(1, done / total);
  const complete = pct >= 1;
  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessible
      accessibilityLabel={label ?? `${done} of ${total} required done`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={complete ? color.green : color.amber}
          strokeOpacity={pct > 0 ? 1 : 0}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {complete ? (
        <Ionicons name="checkmark" size={size * 0.45} color={color.green} />
      ) : (
        <Text style={{ color: color.text, fontSize: size * (center === "percent" ? 0.26 : 0.28), fontWeight: "800" }}>
          {center === "percent" ? `${Math.floor(pct * 100)}%` : total - done}
        </Text>
      )}
    </View>
  );
}

// ── Form fields ──────────────────────────────────────────────────

export function FieldLabel({ label, required, help }: { label: string; required?: boolean; help?: string }) {
  return (
    <View style={{ marginBottom: space.sm }}>
      <Text style={[type.small, { color: color.textDim, fontWeight: "700" }]}>
        {label}
        {required ? <Text style={{ color: color.amber }}> *</Text> : null}
      </Text>
      {help ? <Text style={[type.caption, { color: color.textMuted, marginTop: 2 }]}>{help}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { label: string; unit?: string }) {
  const { label, unit, style, ...rest } = props;
  return (
    <View style={styles.inputWrap}>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.textMuted}
        style={[styles.input, rest.multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 12 }, style]}
        {...rest}
      />
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

export function Chips({
  label,
  options,
  value,
  onChange,
  multi,
}: {
  label: string;
  options: string[];
  value: string | string[] | null | undefined;
  onChange: (next: string | string[] | null) => void;
  multi?: boolean;
}) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  const toggle = (opt: string) => {
    if (!multi) {
      onChange(selected.has(opt) ? null : opt);
      return;
    }
    // "None" is exclusive with everything else.
    let next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else if (opt === "None") next = new Set(["None"]);
    else {
      next.delete("None");
      next.add(opt);
    }
    onChange(Array.from(next));
  };
  return (
    <View style={styles.chips} accessibilityRole={multi ? undefined : "radiogroup"} accessibilityLabel={label}>
      {options.map((opt) => {
        const on = selected.has(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => toggle(opt)}
            accessibilityRole={multi ? "checkbox" : "radio"}
            accessibilityState={multi ? { checked: on } : { selected: on }}
            accessibilityLabel={opt}
            style={[styles.chip, on && styles.chipOn]}
          >
            {on && multi ? <Ionicons name="checkmark" size={18} color={color.onAmber} /> : null}
            <Text style={[styles.chipText, on && { color: color.onAmber }]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[
        { v: true, t: "Yes" },
        { v: false, t: "No" },
      ].map(({ v, t }) => {
        const on = value === v;
        return (
          <Pressable
            key={t}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}: ${t}`}
            style={[styles.chip, styles.yesNo, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && { color: color.onAmber }]}>{t}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Sheet (bottom modal) ─────────────────────────────────────────

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <T variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </T>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        {children}
      </View>
    </Modal>
  );
}

/** Ask for a short written reason (override, retake, blurry keep). */
export function ReasonSheet({
  visible,
  title,
  prompt,
  suggestions,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  prompt: string;
  suggestions: string[];
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = React.useState("");
  React.useEffect(() => {
    if (visible) setText("");
  }, [visible]);
  return (
    <Sheet visible={visible} onClose={onCancel} title={title}>
      <T dim style={{ marginBottom: space.md }}>
        {prompt}
      </T>
      <View style={[styles.chips, { marginBottom: space.md }]}>
        {suggestions.map((s) => (
          <Pressable
            key={s}
            onPress={() => setText(s)}
            style={[styles.chip, text === s && styles.chipOn]}
            accessibilityRole="button"
            accessibilityLabel={`Use reason: ${s}`}
          >
            <Text style={[styles.chipText, text === s && { color: color.onAmber }]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <Input label="Reason" value={text} onChangeText={setText} placeholder="Or type a reason" multiline />
      <Button
        label={confirmLabel}
        onPress={() => onConfirm(text.trim())}
        disabled={text.trim().length < 3}
        style={{ marginTop: space.lg }}
      />
    </Sheet>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  buttonText: { fontSize: 17, fontWeight: "800" },
  iconButton: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  inputWrap: { position: "relative", justifyContent: "center" },
  input: {
    minHeight: TOUCH + 4,
    backgroundColor: color.input,
    borderColor: color.inputBorder,
    borderWidth: 1.5,
    borderRadius: radius.md,
    color: color.text,
    fontSize: 17,
    paddingHorizontal: space.md,
  },
  unit: { position: "absolute", right: space.md, color: color.textMuted, fontSize: 17, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: TOUCH,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.inputBorder,
    backgroundColor: color.input,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipOn: { backgroundColor: color.amber, borderColor: color.amber },
  chipText: { color: color.text, fontSize: 16, fontWeight: "700" },
  yesNo: { minWidth: 96, justifyContent: "center" },
  sheetBackdrop: { flex: 1, backgroundColor: color.overlay },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: color.borderStrong,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", marginBottom: space.sm },
});
