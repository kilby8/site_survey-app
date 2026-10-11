// ============================================================
// Framing guides: a simple line drawing of what a good shot of each
// slot looks like, inside amber viewfinder corners. Shown on empty
// photo slots and, larger, in the slot help sheet. (SiteCapture shows an
// example photo per field; these work offline and never go stale.)
// ============================================================

import React from "react";
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import type { GuideId } from "../survey/blueprint";
import { color } from "./theme";

const S = { stroke: color.textDim, strokeWidth: 2.2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const A = { ...S, stroke: color.amber };

function House({ x = 30, y = 30, w = 60, h = 40, door = true }: { x?: number; y?: number; w?: number; h?: number; door?: boolean }) {
  return (
    <G>
      <Polyline points={`${x - 6},${y + 4} ${x + w / 2},${y - h * 0.55} ${x + w + 6},${y + 4}`} {...S} />
      <Rect x={x} y={y} width={w} height={h} {...S} />
      {door ? <Rect x={x + w / 2 - 6} y={y + h - 20} width={12} height={20} {...S} /> : null}
      <Rect x={x + 8} y={y + 8} width={12} height={10} {...S} />
      <Rect x={x + w - 20} y={y + 8} width={12} height={10} {...S} />
    </G>
  );
}

function Panel({ x, y, w, h, open }: { x: number; y: number; w: number; h: number; open?: boolean }) {
  const rows = [];
  if (open) {
    for (let i = 0; i < 5; i++) {
      const yy = y + 10 + i * ((h - 16) / 5);
      rows.push(<Line key={`l${i}`} x1={x + 8} y1={yy} x2={x + w / 2 - 3} y2={yy} {...S} />);
      rows.push(<Line key={`r${i}`} x1={x + w / 2 + 3} y1={yy} x2={x + w - 8} y2={yy} {...S} />);
    }
  }
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} rx={2} {...S} />
      {open ? rows : <Circle cx={x + w - 8} cy={y + h / 2} r={2.5} {...S} />}
    </G>
  );
}

function Drawing({ id }: { id: GuideId }) {
  switch (id) {
    case "address":
      return (
        <G>
          <Rect x={34} y={30} width={52} height={26} rx={4} {...S} />
          <SvgText x={60} y={50} fontSize={16} fontWeight="700" fill={color.textDim} textAnchor="middle">
            123
          </SvgText>
          <Line x1={60} y1={56} x2={60} y2={78} {...S} />
        </G>
      );
    case "house_front":
    case "elevation_front":
    case "elevation_back":
    case "elevation_left":
    case "elevation_right": {
      const tag = { house_front: null, elevation_front: "F", elevation_back: "B", elevation_left: "L", elevation_right: "R" }[id];
      return (
        <G>
          <House />
          {tag ? (
            <SvgText x={14} y={50} fontSize={14} fontWeight="800" fill={color.amber} textAnchor="middle">
              {tag}
            </SvgText>
          ) : null}
          <Line x1={14} y1={70} x2={106} y2={70} {...S} />
        </G>
      );
    }
    case "path":
      return (
        <G>
          <House x={58} y={28} w={44} h={36} door={false} />
          <Path d="M 14 80 C 30 70, 40 72, 56 62" {...A} strokeDasharray="5 5" />
        </G>
      );
    case "hazard":
      return (
        <G>
          <Polygon points="60,18 92,72 28,72" {...S} />
          <Line x1={60} y1={36} x2={60} y2={56} {...A} strokeWidth={4} />
          <Circle cx={60} cy={64} r={2} fill={color.amber} />
        </G>
      );
    case "wide":
      return (
        <G>
          <House x={44} y={40} w={34} h={24} door={false} />
          <Circle cx={22} cy={44} r={10} {...S} />
          <Line x1={22} y1={54} x2={22} y2={66} {...S} />
          <Circle cx={98} cy={42} r={12} {...S} />
          <Line x1={98} y1={54} x2={98} y2={66} {...S} />
          <Line x1={8} y1={66} x2={112} y2={66} {...S} />
        </G>
      );
    case "shade":
      return (
        <G>
          <Circle cx={30} cy={26} r={9} {...A} />
          <Circle cx={74} cy={38} r={20} {...S} />
          <Line x1={74} y1={58} x2={74} y2={76} {...S} />
          <Line x1={20} y1={76} x2={110} y2={76} {...S} />
        </G>
      );
    case "meter_close":
      return (
        <G>
          <Circle cx={60} cy={45} r={26} {...S} />
          {[40, 52, 64, 76].map((cx) => (
            <Circle key={cx} cx={cx} cy={40} r={4.5} {...S} />
          ))}
          <Rect x={46} y={54} width={28} height={8} {...A} />
        </G>
      );
    case "meter_wide":
      return (
        <G>
          <Rect x={16} y={14} width={88} height={62} {...S} />
          <Circle cx={60} cy={46} r={9} {...A} />
          <Rect x={24} y={22} width={18} height={14} {...S} />
          <Line x1={60} y1={55} x2={60} y2={76} {...S} />
        </G>
      );
    case "service_entry":
      return (
        <G>
          <Rect x={16} y={14} width={88} height={62} {...S} />
          <Path d="M 60 14 L 60 40 L 74 40" {...A} />
          <Rect x={74} y={34} width={16} height={14} {...S} />
        </G>
      );
    case "mast":
      return (
        <G>
          <Line x1={60} y1={18} x2={60} y2={76} {...S} strokeWidth={3} />
          <Path d="M 52 22 Q 60 12 68 22" {...A} />
          <Path d="M 66 24 Q 90 34 112 30" {...S} />
          <Path d="M 66 28 Q 90 40 112 36" {...S} />
          <Line x1={30} y1={76} x2={90} y2={76} {...S} />
        </G>
      );
    case "lateral":
      return (
        <G>
          <Line x1={8} y1={42} x2={112} y2={42} {...S} />
          <Path d="M 20 42 L 20 60 L 100 60 L 100 42" {...A} strokeDasharray="5 5" />
          <Rect x={92} y={22} width={16} height={20} {...S} />
        </G>
      );
    case "panel_closed":
      return <Panel x={38} y={14} w={44} h={62} />;
    case "panel_open":
      return <Panel x={38} y={14} w={44} h={62} open />;
    case "label":
      return (
        <G>
          <Rect x={26} y={20} width={68} height={50} rx={3} {...S} />
          {[32, 42, 52, 62].map((y, i) => (
            <Line key={y} x1={34} y1={y} x2={i === 1 ? 86 : 74} y2={y} {...(i === 1 ? A : S)} />
          ))}
        </G>
      );
    case "breaker":
      return (
        <G>
          <Rect x={40} y={18} width={40} height={54} rx={4} {...S} />
          <Rect x={52} y={30} width={16} height={20} rx={2} {...A} />
          <SvgText x={60} y={66} fontSize={11} fontWeight="800" fill={color.textDim} textAnchor="middle">
            200
          </SvgText>
        </G>
      );
    case "directory":
      return (
        <G>
          <Rect x={30} y={14} width={60} height={62} rx={3} {...S} />
          {[24, 32, 40, 48, 56, 64].map((y) => (
            <G key={y}>
              <Line x1={36} y1={y} x2={56} y2={y} {...S} />
              <Line x1={64} y1={y} x2={84} y2={y} {...S} />
            </G>
          ))}
        </G>
      );
    case "subpanel":
      return (
        <G>
          <Panel x={20} y={20} w={30} h={46} />
          <Panel x={66} y={26} w={34} h={40} open />
          <Line x1={50} y1={40} x2={66} y2={44} {...A} />
        </G>
      );
    case "ground_rod":
      return (
        <G>
          <Line x1={10} y1={46} x2={110} y2={46} {...S} />
          <Line x1={60} y1={30} x2={60} y2={80} {...A} strokeWidth={3} />
          <Path d="M 60 34 Q 78 22 96 18" {...S} />
        </G>
      );
    case "roof_plane":
      return (
        <G>
          <Polygon points="18,70 40,24 102,24 108,70" {...S} />
          <Polygon points="34,62 48,32 92,32 96,62" {...A} strokeDasharray="4 4" />
        </G>
      );
    case "pitch_gauge":
      return (
        <G>
          <Polyline points="14,72 106,72 106,30 14,72" {...S} />
          <Path d="M 40 72 A 26 26 0 0 0 38 62" {...A} />
          <SvgText x={86} y={66} fontSize={12} fontWeight="800" fill={color.amber} textAnchor="middle">
            6/12
          </SvgText>
        </G>
      );
    case "obstruction":
      return (
        <G>
          <Polygon points="12,74 32,30 108,30 112,74" {...S} />
          <Rect x={56} y={36} width={8} height={18} {...A} />
          <Rect x={80} y={44} width={16} height={12} {...A} />
        </G>
      );
    case "material":
      return (
        <G>
          {[22, 38, 54, 70].map((y, r) => (
            <G key={y}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Rect key={i} x={14 + i * 20 + (r % 2) * 10} y={y} width={18} height={14} {...(r === 1 && i === 2 ? A : S)} />
              ))}
            </G>
          ))}
        </G>
      );
    case "attic":
      return (
        <G>
          <Polyline points="10,74 60,18 110,74" {...S} />
          {[30, 45, 60, 75, 90].map((x) => (
            <Line key={x} x1={x} y1={74} x2={x} y2={74 - (60 - Math.abs(60 - x)) * 0.9} {...S} />
          ))}
          <Line x1={45} y1={64} x2={60} y2={64} {...A} />
        </G>
      );
    case "array_area":
      return (
        <G>
          <Line x1={8} y1={72} x2={112} y2={72} {...S} />
          {[0, 1, 2].map((i) => (
            <Polygon key={i} points={`${16 + i * 32},62 ${38 + i * 32},44 ${44 + i * 32},44 ${22 + i * 32},62`} {...A} />
          ))}
        </G>
      );
    case "trench":
      return (
        <G>
          <Polygon points="12,62 30,46 36,46 18,62" {...S} />
          <House x={78} y={34} w={30} h={26} door={false} />
          <Path d="M 30 62 Q 56 70 78 58" {...A} strokeDasharray="5 5" />
        </G>
      );
    case "fence_line":
      return (
        <G>
          <Line x1={8} y1={70} x2={112} y2={70} {...S} />
          {[14, 36, 58, 80].map((x) => (
            <Rect key={x} x={x} y={28} width={20} height={36} {...A} />
          ))}
        </G>
      );
    case "foundation":
      return (
        <G>
          <Line x1={8} y1={50} x2={112} y2={50} {...S} />
          <Rect x={52} y={22} width={16} height={56} {...A} />
        </G>
      );
  }
}

/** Viewfinder corners + drawing. `size` is the width; height is 3:4 of it. */
export function FramingGuide({ id, size = 120 }: { id: GuideId; size?: number }) {
  const c = 12;
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 120 90" accessibilityElementsHidden importantForAccessibility="no">
      <Drawing id={id} />
      <Path d={`M 4 ${4 + c} V 4 H ${4 + c}`} {...A} strokeWidth={3} />
      <Path d={`M ${116 - c} 4 H 116 V ${4 + c}`} {...A} strokeWidth={3} />
      <Path d={`M 4 ${86 - c} V 86 H ${4 + c}`} {...A} strokeWidth={3} />
      <Path d={`M ${116 - c} 86 H 116 V ${86 - c}`} {...A} strokeWidth={3} />
    </Svg>
  );
}
