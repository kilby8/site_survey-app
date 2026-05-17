import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../context/AuthContext';
import { StatusBanner } from '../components/AuthFormHelpers';
import { solarProTheme } from '../theme/solarProTheme';
import { generateStateNonce } from '../utils/generateStateNonce';

const { colors } = solarProTheme;
const BRAND_PRIMARY = colors.primary;
const LOGO_URL = 'https://img1.wsimg.com/isteam/ip/b4ef19f7-7f46-446b-bbe2-755512fcd4f8/UNDER%20THE%20SUN%20LOGO.jpg/:/rs=w:300,h:300,m';
const PENDING_STATE_KEY = 'site-survey.auth.pending-solarpro-state.v1';

WebBrowser.maybeCompleteAuthSession();

// Detect which scheme to use based on runtime environment
function getRedirectScheme(): string {
  // In Expo Go development, use exp:// scheme
  // In production builds, use the configured sitesurvey:// scheme
  const config = Constants.expoConfig;
  const hostUri = config?.hostUri;

  // If we have a hostUri, we're running in Expo Go (development)
  if (hostUri) {
    return 'exp://login';
  }

  // Otherwise, we're in a production build using the configured scheme
  const scheme = config?.scheme || 'sitesurvey';
  return `${scheme}://login`;
}

function isAllowedRedirectUri(value: string): boolean {
  return (
    value.startsWith('exp://') ||
    value.startsWith('sitesurvey://') ||
    value.startsWith('com.underthesun.')
  );
}

function resolveSolarProRedirectUri(): string {
  // In Expo Go, use a stable callback URI. Using the runtime update URL form
  // (exp://u.expo.dev/.../--/login) can cause AuthSession to return dismiss.
  const hostUri = Constants.expoConfig?.hostUri;
  const executionEnvironment = (Constants as unknown as { executionEnvironment?: string }).executionEnvironment;
  if (hostUri || executionEnvironment === 'storeClient') {
    return 'exp://login';
  }

  const envRedirect = process.env.EXPO_PUBLIC_SOLARPRO_REDIRECT_URI?.trim();
  if (envRedirect && isAllowedRedirectUri(envRedirect)) {
    return envRedirect;
  }

  const linkingRedirect = ExpoLinking.createURL('login');
  if (linkingRedirect && isAllowedRedirectUri(linkingRedirect)) {
    return linkingRedirect;
  }

  return getRedirectScheme();
}

const SOLARPRO_REDIRECT_URI = resolveSolarProRedirectUri();

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function firstQueryParam(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[]; state?: string | string[] }>();
  const { signInWithSolarProToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const processedCallbackRef = useRef<string | null>(null);

  const callbackToken = firstParam(params.token);
  const callbackState = firstParam(params.state);

  const handleSolarProCallback = useCallback(async (token: string, state: string) => {
    const storedState = await AsyncStorage.getItem(PENDING_STATE_KEY);
    if (!storedState || storedState !== state) {
      await AsyncStorage.removeItem(PENDING_STATE_KEY);
      throw new Error('This SolarPro sign-in link is no longer valid. Please try again from the app.');
    }

    await signInWithSolarProToken(token);
    await AsyncStorage.removeItem(PENDING_STATE_KEY);
    router.replace('/');
  }, [router, signInWithSolarProToken]);

  useEffect(() => {
    // Only proceed if we have both token and state from the deeplink
    if (!callbackToken || !callbackState) {
      return;
    }

    const callbackKey = `${callbackToken}:${callbackState}`;

    // Prevent duplicate processing if params haven't changed
    if (processedCallbackRef.current === callbackKey) {
      return;
    }

    processedCallbackRef.current = callbackKey;

    let cancelled = false;

    // Process the SolarPro callback with a small delay to ensure async storage is ready
    const timeoutId = setTimeout(async () => {
      if (cancelled) return;

      setSubmitting(true);
      setStatus(null);

      try {
        console.log('[SSO CALLBACK] Processing deeplink:', {
          token: callbackToken.substring(0, 20) + '...',
          state: callbackState,
        });
        await handleSolarProCallback(callbackToken, callbackState);
      } catch (err) {
        if (cancelled) return;
        await AsyncStorage.removeItem(PENDING_STATE_KEY);
        processedCallbackRef.current = null;
        const message = err instanceof Error ? err.message : 'SolarPro sign-in failed. Please try again.';
        console.error('[SSO CALLBACK] Error:', message);
        setStatus({
          type: 'error',
          message,
        });
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [callbackState, callbackToken, handleSolarProCallback]);

   const handleSolarProSignIn = useCallback(async () => {
     if (submitting) return;

     setStatus(null);
     setSubmitting(true);

     try {
       const state = generateStateNonce();
       await AsyncStorage.setItem(PENDING_STATE_KEY, state);

      const redirectUri = SOLARPRO_REDIRECT_URI;
      const authorizeUrl =
        `https://solarpro.solutions/api/auth/authorize` +
        `?redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;

      console.log('[SSO] Using redirect_uri:', redirectUri);
      setDebugInfo(`redirect_uri=${redirectUri}`);

      // Use AuthSession so Expo Go can capture exp:// redirects without browser security blocks.
      let authResult: WebBrowser.WebBrowserAuthSessionResult;
      try {
        authResult = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri);
      } catch (sessionErr) {
        const message = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
        setDebugInfo((prev) => `${prev}\nauth_session_exception=${message}`);

        // Android browsers sometimes throw java/io exceptions from Custom Tabs.
        // Fallback to external browser; the existing deep-link callback listener will finish login.
        if (/java\.io|IOException|CustomTabs|ActivityNotFound/i.test(message)) {
          await Linking.openURL(authorizeUrl);
          setStatus({
            type: 'success',
            message: 'Continuing sign-in in browser. Return to app after SolarPro login.',
          });
          return;
        }

        throw sessionErr;
      }
      setDebugInfo((prev) => `${prev}\nauth_result=${authResult.type}`);

      if (authResult.type !== 'success' || !authResult.url) {
        throw new Error('Sign-in was cancelled before completion.');
      }

      setDebugInfo((prev) => `${prev}\ncallback_url=${authResult.url}`);

      const parsed = ExpoLinking.parse(authResult.url);
      const token = firstQueryParam(parsed.queryParams?.token);
      const stateFromCallback = firstQueryParam(parsed.queryParams?.state);

      if (!token || !stateFromCallback) {
        throw new Error('SolarPro did not return a valid sign-in token.');
      }

      await handleSolarProCallback(token, stateFromCallback);
    } catch (err) {
      await AsyncStorage.removeItem(PENDING_STATE_KEY);
      setDebugInfo((prev) => `${prev}\nerror=${err instanceof Error ? err.message : 'unknown'}`);
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to open SolarPro sign-in.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [handleSolarProCallback, submitting]);

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.accentBar} />
            <View style={styles.cardInner}>
              <View style={styles.logoWrap}>
                <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
              </View>
              <Text style={styles.title}>Site Survey</Text>
              <Text style={styles.subtitle}>Use your SolarPro account to sign in</Text>
              <Text style={styles.helperText}>Local email/password login has been removed. The app now opens SolarPro directly and returns here with a secure handoff token.</Text>

              {status && <StatusBanner type={status.type} message={status.message} />}
              {debugInfo ? <Text style={styles.debugText}>{debugInfo}</Text> : null}

              <TouchableOpacity
                style={[styles.button, submitting && styles.buttonDisabled]}
                onPress={handleSolarProSignIn}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Open SolarPro sign in"
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Open SolarPro</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  accentBar: { height: 4, backgroundColor: BRAND_PRIMARY },
  cardInner: { padding: 28 },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  logo: { width: 150, height: 64, borderRadius: 8 },
  title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6, marginBottom: 14, textAlign: 'center' },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 18,
  },
  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: BRAND_PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: BRAND_PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  buttonDisabled: { opacity: 0.45, shadowOpacity: 0 },
  buttonText: { color: '#0B1220', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  debugText: {
    marginTop: 10,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
});
