/**
 * Shared helpers for auth forms:
 *  - StatusBanner: inline success / error message replaces Alert.alert
 *  - PasswordInput: TextInput with a show/hide toggle
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

// ----------------------------------------------------------------
// StatusBanner
// ----------------------------------------------------------------
interface StatusBannerProps {
  type: 'success' | 'error';
  message: string;
}

export function StatusBanner({ type, message }: StatusBannerProps) {
  const bannerStyle = type === 'success' ? styles.bannerSuccess : styles.bannerError;
  const textStyle = type === 'success' ? styles.bannerSuccessText : styles.bannerErrorText;
  return (
    <View style={[styles.banner, bannerStyle]}>
      <Text style={textStyle}>{message}</Text>
    </View>
  );
}

// ----------------------------------------------------------------
// PasswordInput
// ----------------------------------------------------------------
type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'>;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.pwRow}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        style={[styles.pwInput, props.style as object | undefined]}
      />
      <TouchableOpacity
        onPress={() => setVisible(v => !v)}
        style={styles.pwToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.pwToggleText}>{visible ? '🙈' : '👁'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ----------------------------------------------------------------
// Styles
// ----------------------------------------------------------------
const styles = StyleSheet.create({
  banner: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  bannerSuccess: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.successBorder },
  bannerError:   { backgroundColor: colors.errorBg, borderWidth: 1, borderColor: colors.errorBorder },
  bannerSuccessText: { color: colors.successText, fontSize: 13, fontWeight: '600' },
  bannerErrorText:   { color: colors.errorText, fontSize: 13, fontWeight: '600' },

  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    marginBottom: 16,
    height: 50,
    paddingHorizontal: 14,
  },
  pwInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    height: '100%',
    borderWidth: 0,
    marginBottom: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  pwToggle: { paddingLeft: 8 },
  pwToggleText: { fontSize: 16 },
});
