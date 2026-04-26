import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { PasswordInput, StatusBanner } from '../components/AuthFormHelpers';
import { API_URL } from '../api/client';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;
const BRAND_PRIMARY = colors.primary;
const LOGO_URL = 'https://img1.wsimg.com/isteam/ip/b4ef19f7-7f46-446b-bbe2-755512fcd4f8/UNDER%20THE%20SUN%20LOGO.jpg/:/rs=w:300,h:300,m';

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithPassword } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canSubmit = useMemo(() => identifier.trim().length > 0 && password.trim().length > 0, [identifier, password]);

  async function handleSignIn() {
    if (!canSubmit || submitting) return;
    setStatus(null);
    setSubmitting(true);
    try {
      await signInWithPassword(identifier.trim(), password);
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Please check your credentials and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

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
              <Text style={styles.subtitle}>Sign in to your account</Text>

              {status && <StatusBanner type={status.type} message={status.message} />}

              <Text style={styles.inputLabel}>Email or Username</Text>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Password</Text>
              <PasswordInput
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}
                onPress={handleSignIn}
                disabled={!canSubmit || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <View style={styles.linksRow}>
                <TouchableOpacity onPress={() => router.push('/register')}>
                  <Text style={styles.linkText}>Create account</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/forgot-password')}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.apiHint}>{API_URL}</Text>
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
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6, marginBottom: 24, textAlign: 'center' },
  inputLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 14,
    color: colors.textPrimary,
    marginBottom: 16,
    backgroundColor: colors.inputBg,
    fontSize: 15,
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
  linksRow: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkText: { color: BRAND_PRIMARY, fontSize: 13, fontWeight: '600' },
  apiHint: { marginTop: 16, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
