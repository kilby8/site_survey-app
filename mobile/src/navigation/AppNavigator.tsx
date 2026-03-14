/**
 * navigation/AppNavigator.tsx
 *
 * React Navigation stack navigator.
 * dbReady and deviceId are threaded down from App.tsx so screens
 * can block rendering until the SQLite database is initialised.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import HomeScreen      from '../screens/HomeScreen';
import NewSurveyScreen from '../screens/NewSurveyScreen';
import ViewSurveyScreen from '../screens/ViewSurveyScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

interface Props {
  dbReady:  boolean;
  deviceId: string;
}

export default function AppNavigator({ dbReady, deviceId }: Props) {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle:        { backgroundColor: '#1a56db' },
          headerTintColor:    '#ffffff',
          headerTitleStyle:   { fontWeight: '700', fontSize: 18 },
          headerBackTitleVisible: false,
          contentStyle:       { backgroundColor: '#f0f4ff' },
        }}
      >
        <Stack.Screen
          name="Home"
          options={{ title: 'Site Surveys', headerShown: false }}
        >
          {(props) => <HomeScreen {...props} dbReady={dbReady} />}
        </Stack.Screen>

        <Stack.Screen
          name="NewSurvey"
          options={{ title: 'New Survey', headerShown: true }}
        >
          {(props) => <NewSurveyScreen {...props} deviceId={deviceId} />}
        </Stack.Screen>

        <Stack.Screen
          name="ViewSurvey"
          options={{ title: 'Survey Details', headerShown: true }}
        >
          {(props) => <ViewSurveyScreen {...props} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
