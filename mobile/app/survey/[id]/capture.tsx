import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CaptureScreen } from '../../../src/survey/ui/CaptureScreen';

export default function CaptureRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CaptureScreen surveyId={id} />;
}
