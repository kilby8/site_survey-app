import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppBootstrapProvider, useAppBootstrap } from '../src/context/AppBootstrapContext';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { BugReportProvider, BugReportFloatingButton } from '../src/context/BugReportContext';
import { solarProTheme } from '../src/theme/solarProTheme';

const { colors } = solarProTheme;

function BootstrapGate({ children }: { children: React.ReactNode }) {
  const { ready, error } = useAppBootstrap();

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Database Error</Text>
        <Text style={styles.errorMsg}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Initialising...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const PENDING_HANDOFF_KEY = 'site-survey.pending-handoff.v1';

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ token?: string; t?: string }>();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (loading) return;
    const onAuthRoute = pathname === '/login';

    if (!user && !onAuthRoute) {
      // A SolarPro link opened while signed out: keep it for after sign-in.
      const handoff = pathname === '/new-survey' ? params.token || params.t : undefined;
      void (async () => {
        if (handoff) await AsyncStorage.setItem(PENDING_HANDOFF_KEY, handoff).catch(() => undefined);
        router.replace('/login');
      })();
      return;
    }

    if (user && onAuthRoute) {
      void (async () => {
        const pending = await AsyncStorage.getItem(PENDING_HANDOFF_KEY).catch(() => null);
        if (pending) {
          await AsyncStorage.removeItem(PENDING_HANDOFF_KEY).catch(() => undefined);
          router.replace({ pathname: '/new-survey', params: { token: pending } });
        } else {
          router.replace('/');
        }
      })();
    }
  }, [loading, pathname, router, user, params.token, params.t]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Opening…</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AppBootstrapProvider>
      <AuthProvider>
        <BugReportProvider>
          <StatusBar style="light" />
          <BootstrapGate>
            <AuthGate>
              <View style={styles.rootShell}>
                <Stack
                  screenOptions={{
                    headerStyle: { backgroundColor: colors.card },
                    headerTintColor: colors.textPrimary,
                    headerTitleStyle: { fontWeight: '700', fontSize: 18 },
                    contentStyle: { backgroundColor: colors.background },
                  }}
                >
                  <Stack.Screen name="index" options={{ title: 'Site Surveys', headerShown: false }} />
                  <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
                  <Stack.Screen name="new-survey" options={{ title: 'New Survey', headerShown: false }} />
                  <Stack.Screen name="map" options={{ title: 'Survey Map', headerShown: true }} />
                  <Stack.Screen name="survey/[id]/index" options={{ headerShown: false }} />
                  <Stack.Screen name="survey/[id]/capture" options={{ headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="survey/[id]/photo/[photoId]" options={{ headerShown: false }} />
                  <Stack.Screen name="survey/[id]/camera" options={{ headerShown: false, animation: 'fade' }} />
                </Stack>
                <BugReportFloatingButton />
              </View>
            </AuthGate>
          </BootstrapGate>
        </BugReportProvider>
      </AuthProvider>
    </AppBootstrapProvider>
  );
}

const styles = StyleSheet.create({
  rootShell: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: 24,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.errorText, marginBottom: 8 },
  errorMsg: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  loadingText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
});
