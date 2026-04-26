import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, TextInput, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, Alert, NativeModules, NativeEventEmitter, Platform,
} from 'react-native';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;
const { SpeechModule } = NativeModules;
const emitter = SpeechModule ? new NativeEventEmitter(SpeechModule) : null;

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  numberOfLines?: number;
  style?: object;
}

export default function VoiceNoteInput({
  value,
  onChangeText,
  placeholder = 'Notes (optional)',
  numberOfLines = 3,
  style,
}: Props) {
  const [listening, setListening] = useState(false);
  const [interim,   setInterim]   = useState('');
  const baseRef = useRef(value);

  useEffect(() => {
    if (!listening) baseRef.current = value;
  }, [value, listening]);

  useEffect(() => {
    if (!emitter) return;

    const subs = [
      emitter.addListener('speech_start', () => setListening(true)),
      emitter.addListener('speech_end',   () => setListening(false)),
      emitter.addListener('speech_results', (transcript: string) => {
        setInterim('');
        const sep = baseRef.current.trim() ? ' ' : '';
        onChangeText(baseRef.current.trim() + sep + transcript);
      }),
      emitter.addListener('speech_partial', (partial: string) => setInterim(partial)),
      emitter.addListener('speech_error', (code: string) => {
        setListening(false);
        setInterim('');
        // 7 = no match - not really an error
        if (code !== '7') Alert.alert('Voice error', `Code ${code}`);
      }),
    ];
    return () => subs.forEach(s => s.remove());
  }, [onChangeText]);

  const toggleListening = useCallback(async () => {
    if (!SpeechModule) {
      Alert.alert('Not available', 'Voice input is not available on this device.');
      return;
    }
    if (listening) {
      await SpeechModule.stop();
      setListening(false);
    } else {
      try {
        baseRef.current = value;
        setInterim('');
        await SpeechModule.start();
      } catch (e: any) {
        Alert.alert('Voice error', e?.message ?? String(e));
      }
    }
  }, [listening, value]);

  const displayValue = listening && interim
    ? value.trim() + (value.trim() ? ' ' : '') + interim
    : value;

  return (
    <View style={[styles.wrapper, style]}>
      <TextInput
        style={[
          styles.input,
          numberOfLines > 1 && { minHeight: numberOfLines * 22 + 20 },
          listening && styles.inputListening,
        ]}
        value={displayValue}
        onChangeText={t => { baseRef.current = t; onChangeText(t); }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={numberOfLines > 1}
        numberOfLines={numberOfLines}
        textAlignVertical="top"
      />
      <TouchableOpacity
        style={[styles.micBtn, listening && styles.micBtnActive]}
        onPress={toggleListening}
        activeOpacity={0.7}
        hitSlop={6}
      >
        {listening ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.micIcon}>&#x1F3A4;</Text>
        )}
      </TouchableOpacity>
      {listening && (
        <Text style={styles.listeningLabel}>Listening...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', marginBottom: 12 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 52,
    color: colors.textPrimary,
    backgroundColor: colors.inputBg,
    fontSize: 14,
  },
  inputListening: { borderColor: colors.primary, borderWidth: 2 },
  micBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: colors.primary },
  micIcon: { fontSize: 16, lineHeight: 20 },
  listeningLabel: {
    fontSize: 11,
    color: colors.primary,
    fontStyle: 'italic',
    marginTop: 4,
    marginLeft: 4,
  },
});