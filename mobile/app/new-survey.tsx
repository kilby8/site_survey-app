import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StartSurveyScreen } from '../src/survey/ui/StartSurveyScreen';

export default function NewSurveyRoute() {
  // SolarPro handoff links arrive as sitesurvey://new-survey?token=… (or ?t=…)
  const { token, t, mode } = useLocalSearchParams<{ token?: string; t?: string; mode?: string }>();
  return <StartSurveyScreen handoffToken={token || t || undefined} mode={mode === "install" ? "install" : "survey"} />;
}
