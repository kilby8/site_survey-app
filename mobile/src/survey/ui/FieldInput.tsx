import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Chips, FieldLabel, Input, styles as ui, YesNo } from "../../ui/components";
import { color, space } from "../../ui/theme";
import type { AnswerValue, FieldDef } from "../blueprint";

const COMPASS: { label: string; deg: number }[] = [
  { label: "N", deg: 0 },
  { label: "E", deg: 90 },
  { label: "S", deg: 180 },
  { label: "W", deg: 270 },
];

function parseNumber(text: string): number | null {
  const clean = text.replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!clean || clean === "-" || clean === ".") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Number input that keeps what the user is typing (e.g. "12.") while storing a number. */
function NumberInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  const [text, setText] = React.useState(typeof value === "number" ? String(value) : "");
  React.useEffect(() => {
    if (typeof value === "number" && parseNumber(text) !== value) setText(String(value));
    if (value === null || value === undefined) {
      if (text && parseNumber(text) !== null) setText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const outOfRange =
    typeof value === "number" &&
    ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max));
  return (
    <View>
      <Input
        label={field.label}
        unit={field.unit}
        value={text}
        keyboardType={field.keyboard === "decimal-pad" ? "decimal-pad" : "numeric"}
        placeholder={field.placeholder}
        onChangeText={(t) => {
          setText(t);
          onChange(parseNumber(t));
        }}
        style={outOfRange ? { borderColor: color.red } : undefined}
      />
      {outOfRange ? (
        <Text style={{ color: color.red, marginTop: 4, fontSize: 14 }}>
          Expected {field.min ?? "…"}–{field.max ?? "…"} {field.unit ?? ""}
        </Text>
      ) : null}
    </View>
  );
}

function AzimuthInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  const [reading, setReading] = React.useState(false);
  const useCompass = async () => {
    setReading(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const h = await Location.getHeadingAsync();
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (deg >= 0) onChange(Math.round(deg) % 360);
    } catch {
      // compass not available
    } finally {
      setReading(false);
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      <NumberInput field={field} value={value} onChange={onChange} />
      <View style={ui.chips}>
        {COMPASS.map((c) => (
          <Pressable
            key={c.label}
            onPress={() => onChange(c.deg)}
            accessibilityRole="button"
            accessibilityLabel={`Set azimuth ${c.label}, ${c.deg} degrees`}
            style={[ui.chip, value === c.deg && ui.chipOn, { minWidth: 56, justifyContent: "center" }]}
          >
            <Text style={[ui.chipText, value === c.deg && { color: color.onAmber }]}>{c.label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={useCompass}
          accessibilityRole="button"
          accessibilityLabel="Read azimuth from phone compass. Point the top of the phone the way the roof faces."
          style={[ui.chip, { borderColor: color.amber }]}
        >
          <Ionicons name="compass-outline" size={20} color={color.amber} />
          <Text style={[ui.chipText, { color: color.amber }]}>{reading ? "Reading…" : "Phone compass"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const QUICK_PITCHES = ["4/12", "6/12", "8/12", "10/12", "12/12"];

/** Pitch as x/12: big − / + buttons plus the common pitches one tap away. */
function PitchInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  const options = field.options ?? [];
  const idx = typeof value === "string" ? options.indexOf(value) : -1;
  const step = (d: number) => {
    // First press with nothing set lands on the most common pitch, 6/12.
    if (idx < 0) {
      onChange(options.includes("6/12") ? "6/12" : options[0]);
      return;
    }
    const next = Math.max(0, Math.min(options.length - 1, idx + d));
    onChange(options[next]);
  };
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Less steep" style={[ui.chip, { width: 64, justifyContent: "center" }]}>
          <Ionicons name="remove" size={26} color={color.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }} accessible accessibilityLabel={`Pitch ${idx < 0 ? "not set" : options[idx]}`}>
          <Text style={{ color: idx < 0 ? color.textMuted : color.text, fontSize: 30, fontWeight: "800" }}>
            {idx < 0 ? "–/12" : options[idx]}
          </Text>
          {idx >= 0 ? (
            <Text style={{ color: color.textMuted, fontSize: 14 }}>
              {Math.round((Math.atan(Number(options[idx].split("/")[0]) / 12) * 180) / Math.PI)}°
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Steeper" style={[ui.chip, { width: 64, justifyContent: "center" }]}>
          <Ionicons name="add" size={26} color={color.text} />
        </Pressable>
      </View>
      <View style={ui.chips}>
        {QUICK_PITCHES.filter((q) => options.includes(q)).map((q) => (
          <Pressable
            key={q}
            onPress={() => onChange(q)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === q }}
            accessibilityLabel={`Pitch ${q}`}
            style={[ui.chip, value === q && ui.chipOn]}
          >
            <Text style={[ui.chipText, value === q && { color: color.onAmber }]}>{q}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  let control: React.ReactNode;
  switch (field.kind) {
    case "text":
    case "multiline":
      control = (
        <Input
          label={field.label}
          value={typeof value === "string" ? value : ""}
          onChangeText={(t) => onChange(t)}
          placeholder={field.placeholder}
          multiline={field.kind === "multiline"}
        />
      );
      break;
    case "number":
      control = <NumberInput field={field} value={value} onChange={onChange} />;
      break;
    case "azimuth":
      control = <AzimuthInput field={field} value={value} onChange={onChange} />;
      break;
    case "pitch":
      control = <PitchInput field={field} value={value} onChange={onChange} />;
      break;
    case "choice":
      control = (
        <Chips
          label={field.label}
          options={field.options ?? []}
          value={typeof value === "string" ? value : null}
          onChange={(v) => onChange(v as string | null)}
        />
      );
      break;
    case "multichoice":
      control = (
        <Chips
          label={field.label}
          options={field.options ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v as string[])}
          multi
        />
      );
      break;
    case "yesno":
      control = <YesNo label={field.label} value={typeof value === "boolean" ? value : null} onChange={onChange} />;
      break;
  }
  return (
    <View style={{ marginBottom: space.lg }}>
      <FieldLabel label={field.label} required={field.required} help={field.help} />
      {control}
    </View>
  );
}
