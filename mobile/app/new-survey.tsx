import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StartSurveyScreen } from '../src/survey/ui/StartSurveyScreen';

export default function NewSurveyRoute() {
  // SolarPro handoff links arrive as sitesurvey://new-survey?token=… (or ?t=…)
  const { token, t } = useLocalSearchParams<{ token?: string; t?: string }>();
  return <StartSurveyScreen handoffToken={token || t || undefined} />;
}
