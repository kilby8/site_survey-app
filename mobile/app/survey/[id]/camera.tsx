import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { GuidedCameraScreen } from '../../../src/survey/ui/GuidedCameraScreen';

export default function CameraRoute() {
  const { id, slot, plane } = useLocalSearchParams<{ id: string; slot: string; plane?: string }>();
  return <GuidedCameraScreen surveyId={id} slotId={slot} planeId={plane || null} />;
}
