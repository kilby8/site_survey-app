import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import ViewSurveyScreen from '../../../src/screens/ViewSurveyScreen';
import { getDb } from '../../../src/database/surveyDb';
import { SurveyStatusScreen } from '../../../src/survey/ui/SurveyStatusScreen';

/** v2 surveys get the new status screen; older surveys keep the old detail view. */
export default function SurveyDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [kind, setKind] = React.useState<'v2' | 'legacy' | null>(null);

  React.useEffect(() => {
    void (async () => {
      const row = await getDb().getFirstAsync<{ v2: number }>(
        'SELECT doc IS NOT NULL AS v2 FROM surveys WHERE id = ?',
        [id],
      );
      setKind(row && row.v2 ? 'v2' : 'legacy');
    })();
  }, [id]);

  if (!kind) return <View style={{ flex: 1, backgroundColor: '#050B1F' }} />;
  if (kind === 'v2') return <SurveyStatusScreen surveyId={id} />;
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Survey Details' }} />
      <ViewSurveyScreen />
    </>
  );
}
