// ============================================================
// Photo markup: draw, arrow, box, text and solar stamps.
// Marks are stored as vectors (0–1 coordinates) so a markup can be
// edited later; the saved image is rendered at the photo's own pixel
// size, not the screen's.
// ============================================================

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { G, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { Button, IconButton, Input, Sheet, T } from "../../ui/components";
import { color, radius, space } from "../../ui/theme";

export type Mark =
  | { kind: "pen"; color: string; pts: [number, number][] }
  | { kind: "arrow"; color: string; a: [number, number]; b: [number, number] }
  | { kind: "box"; color: string; a: [number, number]; b: [number, number] }
  | { kind: "text"; color: string; at: [number, number]; text: string; stamp?: boolean };

type Tool = "pen" | "arrow" | "box" | "text" | "stamp";

export const INKS = [color.amber, "#FF4D5E", "#FFFFFF", "#3DD68C"];
export const STAMPS = ["MSP", "Sub panel", "Meter", "Disconnect", "Vent", "Rafter", "Obstruction", "Conduit path"];

const TOOLS: { id: Tool; icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }[] = [
  { id: "pen", icon: "brush", label: "Draw" },
  { id: "arrow", icon: "arrow-forward", label: "Arrow" },
  { id: "box", icon: "square-outline", label: "Box" },
  { id: "text", icon: "text", label: "Text" },
  { id: "stamp", icon: "pricetag-outline", label: "Stamp" },
];

function arrowHead(a: [number, number], b: [number, number], size: number): string {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const p1 = [b[0] - size * Math.cos(ang - 0.45), b[1] - size * Math.sin(ang - 0.45)];
  const p2 = [b[0] - size * Math.cos(ang + 0.45), b[1] - size * Math.sin(ang + 0.45)];
  return `${b[0]},${b[1]} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`;
}

/** Draw marks scaled to a w×h canvas. Shared by the editor and the capture. */
export function MarksLayer({ marks, w, h }: { marks: Mark[]; w: number; h: number }) {
  const stroke = Math.max(3, w / 160);
  const font = Math.max(16, w / 22);
  const X = (p: [number, number]) => [p[0] * w, p[1] * h] as [number, number];
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      {marks.map((m, i) => {
        if (m.kind === "pen") {
          const d = m.pts.map((p, j) => `${j ? "L" : "M"} ${(p[0] * w).toFixed(1)} ${(p[1] * h).toFixed(1)}`).join(" ");
          return <Path key={i} d={d} stroke={m.color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
        }
        if (m.kind === "arrow") {
          const a = X(m.a);
          const b = X(m.b);
          return (
            <G key={i}>
              <Line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={m.color} strokeWidth={stroke} strokeLinecap="round" />
              <Polygon points={arrowHead(a, b, stroke * 5)} fill={m.color} />
            </G>
          );
        }
        if (m.kind === "box") {
          const a = X(m.a);
          const b = X(m.b);
          return (
            <Rect
              key={i}
              x={Math.min(a[0], b[0])}
              y={Math.min(a[1], b[1])}
              width={Math.abs(b[0] - a[0])}
              height={Math.abs(b[1] - a[1])}
              stroke={m.color}
              strokeWidth={stroke}
              fill="none"
              rx={stroke}
            />
          );
        }
        const at = X(m.at);
        const padX = font * 0.45;
        const width = m.text.length * font * 0.6 + padX * 2;
        return (
          <G key={i}>
            {m.stamp ? (
              <Rect x={at[0]} y={at[1] - font * 1.15} width={width} height={font * 1.45} rx={font * 0.35} fill={m.color} />
            ) : null}
            <SvgText
              x={at[0] + (m.stamp ? padX : 0)}
              y={at[1]}
              fill={m.stamp ? "#111" : m.color}
              fontSize={font}
              fontWeight="800"
              stroke={m.stamp ? undefined : "#000"}
              strokeWidth={m.stamp ? 0 : font / 24}
            >
              {m.text}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

export function MarkupEditor({
  uri,
  displayWidth,
  aspect,
  pixelWidth,
  initial,
  onCancel,
  onSave,
}: {
  uri: string;
  displayWidth: number;
  /** width / height of the photo */
  aspect: number;
  /** Photo width in pixels; the saved markup is rendered at this size. */
  pixelWidth: number;
  initial: Mark[];
  onCancel: () => void;
  onSave: (marks: Mark[], tmpUri: string) => Promise<void>;
}) {
  const w = displayWidth;
  const h = displayWidth / aspect;
  const [marks, setMarksState] = React.useState<Mark[]>(initial);
  // Every change is undoable, including "clear all".
  const history = React.useRef<Mark[][]>([]);
  const setMarks = React.useCallback((next: Mark[] | ((m: Mark[]) => Mark[])) => {
    setMarksState((cur) => {
      const value = typeof next === "function" ? next(cur) : next;
      history.current.push(cur);
      return value;
    });
  }, []);
  const undo = () => {
    const prev = history.current.pop();
    if (prev) setMarksState(prev);
  };
  const [draft, setDraft] = React.useState<Mark | null>(null);
  const [tool, setTool] = React.useState<Tool>("arrow");
  const [ink, setInk] = React.useState(INKS[0]);
  const [stamp, setStamp] = React.useState(STAMPS[0]);
  const [textAt, setTextAt] = React.useState<[number, number] | null>(null);
  const [textValue, setTextValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const shot = React.useRef<View>(null);

  const st = React.useRef({ tool, ink, stamp, draft: null as Mark | null });
  st.current.tool = tool;
  st.current.ink = ink;
  st.current.stamp = stamp;

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const p: [number, number] = [e.nativeEvent.locationX / w, e.nativeEvent.locationY / h];
          const { tool: t, ink: c, stamp: sText } = st.current;
          if (t === "text") {
            setTextAt(p);
            setTextValue("");
            return;
          }
          if (t === "stamp") {
            setMarks((m) => [...m, { kind: "text", color: c, at: p, text: sText, stamp: true }]);
            return;
          }
          const d: Mark = t === "pen" ? { kind: "pen", color: c, pts: [p] } : { kind: t, color: c, a: p, b: p };
          st.current.draft = d;
          setDraft(d);
        },
        onPanResponderMove: (e) => {
          const d = st.current.draft;
          if (!d) return;
          const p: [number, number] = [
            Math.max(0, Math.min(1, e.nativeEvent.locationX / w)),
            Math.max(0, Math.min(1, e.nativeEvent.locationY / h)),
          ];
          const next: Mark = d.kind === "pen" ? { ...d, pts: [...d.pts, p] } : d.kind === "text" ? d : { ...d, b: p };
          st.current.draft = next;
          setDraft(next);
        },
        onPanResponderRelease: () => {
          const d = st.current.draft;
          st.current.draft = null;
          setDraft(null);
          if (!d) return;
          const tiny = d.kind !== "pen" && d.kind !== "text" && Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) < 0.02;
          if (!tiny) setMarks((m) => [...m, d]);
        },
      }),
    [w, h],
  );

  // Saving renders the photo + marks off screen at the photo's pixel size,
  // so the marked-up copy is as sharp as the original.
  const [render, setRender] = React.useState<{ wDp: number; hDp: number } | null>(null);
  const loaded = React.useRef<(() => void) | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      const outPx = Math.max(800, Math.round(pixelWidth));
      const wDp = outPx / PixelRatio.get();
      const ready = new Promise<void>((resolve) => {
        loaded.current = resolve;
      });
      setRender({ wDp, hDp: wDp / aspect });
      await Promise.race([ready, new Promise((r) => setTimeout(r, 4000))]);
      await new Promise((r) => setTimeout(r, 50));
      const tmp = await captureRef(shot, {
        format: "jpg",
        quality: 0.92,
        result: "tmpfile",
        width: outPx,
        height: Math.round(outPx / aspect),
      });
      await onSave(marks, tmp);
    } finally {
      setRender(null);
      setSaving(false);
    }
  };

  const shown = draft ? [...marks, draft] : marks;

  return (
    <View>
      <View style={{ width: w, height: h, backgroundColor: "#000" }}>
        <Image source={{ uri }} style={{ width: w, height: h }} resizeMode="cover" />
        <MarksLayer marks={shown} w={w} h={h} />
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
      </View>

      {render ? (
        // Rendered on screen (Android may not draw views outside the window),
        // under an opaque "Saving" cover.
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
          <View
            ref={shot}
            collapsable={false}
            style={{ position: "absolute", left: 0, top: 0, width: render.wDp, height: render.hDp, backgroundColor: "#000" }}
          >
            <Image
              source={{ uri }}
              style={{ width: render.wDp, height: render.hDp }}
              resizeMode="cover"
              onLoad={() => loaded.current?.()}
            />
            <MarksLayer marks={marks} w={render.wDp} h={render.hDp} />
          </View>
          <View style={[StyleSheet.absoluteFill, s.cover]}>
            <T variant="title">Saving markup…</T>
          </View>
        </View>
      ) : null}

      <View style={s.tools}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {TOOLS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTool(t.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: tool === t.id }}
              accessibilityLabel={t.label}
              style={[s.tool, tool === t.id && s.toolOn]}
            >
              <Ionicons name={t.icon} size={20} color={tool === t.id ? color.onAmber : color.text} />
              <Text style={[s.toolText, tool === t.id && { color: color.onAmber }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tool === "stamp" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
            {STAMPS.map((x) => (
              <Pressable
                key={x}
                onPress={() => setStamp(x)}
                accessibilityRole="button"
                accessibilityState={{ selected: stamp === x }}
                accessibilityLabel={`Stamp ${x}`}
                style={[s.stamp, stamp === x && s.toolOn]}
              >
                <Text style={[s.toolText, stamp === x && { color: color.onAmber }]}>{x}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={s.row}>
          {INKS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setInk(c)}
              accessibilityRole="button"
              accessibilityLabel={`Colour ${c === color.amber ? "amber" : c === "#FFFFFF" ? "white" : c === "#3DD68C" ? "green" : "red"}`}
              style={[s.swatch, { backgroundColor: c }, ink === c && s.swatchOn]}
            />
          ))}
          <View style={{ flex: 1 }} />
          <IconButton icon="arrow-undo" label="Undo" onPress={undo} />
          <IconButton icon="trash-outline" label="Clear all marks" onPress={() => setMarks([])} tint={color.red} />
        </View>

        <T variant="caption" muted>
          {
            {
              pen: "Drag to draw.",
              arrow: "Drag from the label to the thing it points at.",
              box: "Drag to box an area.",
              text: "Tap where the text goes.",
              stamp: "Pick a stamp, then tap the photo.",
            }[tool]
          }
        </T>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Cancel" kind="secondary" style={{ flex: 1 }} onPress={onCancel} />
          <Button label="Save markup" style={{ flex: 1.4 }} onPress={() => void save()} busy={saving} />
        </View>
      </View>

      <Sheet visible={!!textAt} onClose={() => setTextAt(null)} title="Add text">
        <Input label="Text on photo" value={textValue} onChangeText={setTextValue} placeholder="e.g. 24 in O.C." autoFocus />
        <Button
          label="Place text"
          style={{ marginTop: space.lg }}
          disabled={!textValue.trim()}
          onPress={() => {
            if (textAt) setMarks((m) => [...m, { kind: "text", color: ink, at: textAt, text: textValue.trim() }]);
            setTextAt(null);
          }}
        />
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  tools: { padding: space.lg, gap: space.md, backgroundColor: color.surface },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tool: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.inputBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stamp: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.inputBorder,
    justifyContent: "center",
  },
  toolOn: { backgroundColor: color.amber, borderColor: color.amber },
  toolText: { color: color.text, fontWeight: "800", fontSize: 16 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: color.border },
  swatchOn: { borderColor: color.text, borderWidth: 3 },
  cover: { backgroundColor: color.bg, alignItems: "center", justifyContent: "center" },
});
