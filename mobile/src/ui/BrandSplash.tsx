import React from "react";
import { Animated, Image, StyleSheet, useWindowDimensions } from "react-native";

// The full SolarPro logo shown while the app starts (database, saved sign-in).
// Background matches the native splash and the logo artwork, so the hand-off
// from the system splash is seamless.
export const SPLASH_BG = "#081318";
const LOGO = require("../../assets/splash-logo.jpg");
const LOGO_ASPECT = 1200 / 827;
/** Long enough to read the logo, short enough not to slow anyone down. */
const MIN_VISIBLE_MS = 1400;
const FADE_MS = 350;

/**
 * Covers the app until `ready` is true and the minimum time has passed,
 * then fades out and unmounts. The app renders underneath meanwhile.
 */
export function BrandSplash({ ready }: { ready: boolean }) {
  const { width } = useWindowDimensions();
  const opacity = React.useRef(new Animated.Value(1)).current;
  const [minElapsed, setMinElapsed] = React.useState(false);
  const [gone, setGone] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    if (!ready || !minElapsed) return;
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => setGone(true));
  }, [ready, minElapsed, opacity]);

  if (gone) return null;
  const logoW = Math.min(width * 0.9, 520);
  return (
    <Animated.View
      pointerEvents={ready && minElapsed ? "none" : "auto"}
      style={[StyleSheet.absoluteFill, s.root, { opacity }]}
      accessibilityLabel="SolarPro. Plan, design, engineer, permit, build."
    >
      <Image source={LOGO} style={{ width: logoW, height: logoW / LOGO_ASPECT }} resizeMode="contain" />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: SPLASH_BG, alignItems: "center", justifyContent: "center", zIndex: 1000, elevation: 1000 },
});
