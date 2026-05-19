import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { AppBootstrapProvider, useAppBootstrap } from '../src/context/AppBootstrapContext';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { BugReportProvider, BugReportFloatingButton } from '../src/context/BugReportContext';
import { solarProTheme } from '../src/theme/solarProTheme';

const { colors } = solarProTheme;

// ----------------------------------------------------------------
// Eager OTA update gate — checks and applies any pending update
// before the rest of the app renders.
// ----------------------------------------------------------------
function OtaUpdateGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = React.useState(!__DEV__);

  React.useEffect(() => {
    if (__DEV__) return; // Skip in dev — expo-updates not available
    let mounted = true;

    async function checkAndApply() {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          // Reload immediately so the fresh bundle is active from the first user interaction
          await Updates.reloadAsync();
          // reloadAsync() never returns on success — safety stop
          return;
        }
      } catch {
        // Non-fatal: if update check fails, continue with current bundle
      }
      if (mounted) setChecking(false);
    }

    checkAndApply();
    return () => { mounted = false; };
  }, []);

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Checking for updates…</Text>
      </View>
    );
  }

  return <>{children}</>;
}

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

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (loading) return;

    const authRoutes = new Set(['/login']);
    const onAuthRoute = authRoutes.has(pathname);

    if (!user && !onAuthRoute) {
      router.replace('/login');
      return;
    }

    if (user && onAuthRoute) {
      router.replace('/');
    }
  }, [loading, pathname, router, user]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Checking session...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

function FloatingHomeButton() {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.homeFab}
      onPress={() => router.replace('/')}
      accessibilityRole="button"
      accessibilityLabel="Go Home"
    >
      <Text style={styles.homeFabIcon}>⌂</Text>
      <Text style={styles.homeFabText}>Home</Text>
    </TouchableOpacity>
  );
}

export default function RootLayout() {
  return (
    <OtaUpdateGate>
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
                    <Stack.Screen name="new-survey" options={{ title: 'New Survey', headerShown: true }} />
                    <Stack.Screen name="map" options={{ title: 'Survey Map', headerShown: true }} />
                    <Stack.Screen name="survey/[id]" options={{ title: 'Survey Details', headerShown: true }} />
                  </Stack>
                  <FloatingHomeButton />
                  <BugReportFloatingButton />
                </View>
              </AuthGate>
            </BootstrapGate>
          </BugReportProvider>
        </AuthProvider>
      </AppBootstrapProvider>
    </OtaUpdateGate>
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
  homeFab: {
    position: 'absolute',
    left: 16,
    bottom: 84,
    backgroundColor: colors.primary,
    borderRadius: 22,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
  },
  homeFabIcon: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 17,
  },
  homeFabText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
