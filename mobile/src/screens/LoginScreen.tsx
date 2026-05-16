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
import { useAuth } from '../context/AuthContext';
import { StatusBanner } from '../components/AuthFormHelpers';
import { solarProTheme } from '../theme/solarProTheme';
import { generateStateNonce } from '../utils/generateStateNonce';

const { colors } = solarProTheme;
const BRAND_PRIMARY = colors.primary;
const LOGO_URL = 'https://img1.wsimg.com/isteam/ip/b4ef19f7-7f46-446b-bbe2-755512fcd4f8/UNDER%20THE%20SUN%20LOGO.jpg/:/rs=w:300,h:300,m';
const PENDING_STATE_KEY = 'site-survey.auth.pending-solarpro-state.v1';
const SOLARPRO_REDIRECT_URI = process.env.EXPO_PUBLIC_SOLARPRO_REDIRECT_URI?.trim() || 'https://solarpro.solutions/login';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[]; state?: string | string[] }>();
  const { signInWithSolarProToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
    if (!callbackToken || !callbackState) return;

    const callbackKey = `${callbackToken}:${callbackState}`;
    if (processedCallbackRef.current === callbackKey) return;
    processedCallbackRef.current = callbackKey;

    let cancelled = false;

    void (async () => {
      setSubmitting(true);
      setStatus(null);
      try {
        await handleSolarProCallback(callbackToken, callbackState);
      } catch (err) {
        if (cancelled) return;
        await AsyncStorage.removeItem(PENDING_STATE_KEY);
        processedCallbackRef.current = null;
        setStatus({
          type: 'error',
          message: err instanceof Error ? err.message : 'SolarPro sign-in failed. Please try again.',
        });
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    })();

    return () => {
      cancelled = true;
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

      await Linking.openURL(authorizeUrl);
    } catch (err) {
      await AsyncStorage.removeItem(PENDING_STATE_KEY);
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to open SolarPro sign-in.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

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
});
