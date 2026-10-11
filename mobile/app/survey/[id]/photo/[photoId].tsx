import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PhotoScreen } from '../../../../src/survey/ui/PhotoScreen';

export default function PhotoRoute() {
  const { id, photoId } = useLocalSearchParams<{ id: string; photoId: string }>();
  return <PhotoScreen surveyId={id} photoId={photoId} />;
}
