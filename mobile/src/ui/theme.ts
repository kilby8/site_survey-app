// ============================================================
// Design tokens. Brand: SolarPro navy + amber (kept from solarProTheme).
// Sized for outdoor use: 17 pt body, 48 pt minimum touch targets,
// high-contrast text on the dark background.
// ============================================================

import { solarProTheme } from "../theme/solarProTheme";

const base = solarProTheme.colors;

export const color = {
  bg: base.background, // #050B1F
  surface: base.card, // #0A1533
  surfaceRaised: "#0F1D42",
  border: base.border,
  borderStrong: "#2E4277",
  input: base.inputBg,
  inputBorder: base.inputBorder,
  text: base.textPrimary,
  textDim: "#B4C2DF", // brighter than textSecondary for sunlight legibility
  textMuted: "#A3B3D3", // lifted from #93A4C6 for contrast outdoors
  amber: base.primary,
  amberDark: base.primaryDark,
  onAmber: "#1A1203",
  green: "#3DD68C",
  greenBg: base.successBg,
  greenBorder: base.successBorder,
  red: "#FF7A85",
  redBg: base.errorBg,
  redBorder: base.errorBorder,
  blue: "#7CB3FF",
  blueBg: "#0E2347",
  overlay: "rgba(2, 6, 18, 0.72)",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const type = {
  caption: { fontSize: 14, lineHeight: 19 },
  small: { fontSize: 15, lineHeight: 20 },
  body: { fontSize: 17, lineHeight: 24 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const },
  heading: { fontSize: 26, lineHeight: 32, fontWeight: "800" as const },
};

/** Minimum touch target (pt). */
export const TOUCH = 48;
