import React from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { applicationName, nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { captureScreen } from 'react-native-view-shot';
import { submitBugReport } from '../api/client';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

type BugMetadata = Record<string, unknown>;

interface OpenBugReportOptions {
  title?: string;
  note?: string;
  metadata?: BugMetadata;
}

interface BugReportContextValue {
  openBugReport: (options?: OpenBugReportOptions) => void;
  reportingBug: boolean;
}

const BugReportContext = React.createContext<BugReportContextValue | undefined>(undefined);

function getAppVersionLabel(): string {
  const appName = applicationName || 'Site Survey';
  const version = nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'unknown';
  const build = nativeBuildVersion
    ?? (Platform.OS === 'android'
      ? Constants.expoConfig?.android?.versionCode?.toString()
      : Constants.expoConfig?.ios?.buildNumber)
    ?? 'unknown';

  return `${appName} v${version} (${build})`;
}

export function BugReportProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [reportTitle, setReportTitle] = React.useState('Mobile Bug Report');
  const [reportingBug, setReportingBug] = React.useState(false);
  const [extraMetadata, setExtraMetadata] = React.useState<BugMetadata>({});

  const openBugReport = React.useCallback((options?: OpenBugReportOptions) => {
    setReportTitle(options?.title?.trim() || 'Mobile Bug Report');
    setNote(options?.note?.trim() || '');
    setExtraMetadata(options?.metadata ?? {});
    setIsOpen(true);
  }, []);

  const closeMenu = React.useCallback(() => {
    if (reportingBug) return;
    setIsOpen(false);
  }, [reportingBug]);

  const sendBugReport = React.useCallback(async () => {
    if (reportingBug) return;

    setReportingBug(true);

    try {
      const screenshotUri = await captureScreen({
        format: 'jpg',
        quality: 0.82,
      });

      const result = await submitBugReport({
        screenshotUri,
        title: reportTitle,
        description: note.trim(),
        metadata: {
          source: 'APP',
          source_tag: 'APP',
          origin: 'site-survey-app',
          route: pathname,
          appVersion: getAppVersionLabel(),
          deviceName: Device.modelName ?? null,
          osName: Device.osName ?? null,
          osVersion: Device.osVersion ?? null,
          reportedAt: new Date().toISOString(),
          ...extraMetadata,
        },
      });

      setIsOpen(false);
      setNote('');
      setExtraMetadata({});
      Alert.alert('Bug report sent', `Report ${result.id} uploaded successfully.`);
    } catch (error) {
      Alert.alert(
        'Bug report failed',
        error instanceof Error ? error.message : 'Unable to send bug report.',
      );
    } finally {
      setReportingBug(false);
    }
  }, [extraMetadata, note, pathname, reportTitle, reportingBug]);

  const contextValue = React.useMemo<BugReportContextValue>(
    () => ({
      openBugReport,
      reportingBug,
    }),
    [openBugReport, reportingBug],
  );

  return (
    <BugReportContext.Provider value={contextValue}>
      {children}

      <Modal
        animationType="slide"
        transparent
        visible={isOpen}
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.title}>Bug Report</Text>
            <Text style={styles.subtitle}>Attach a screenshot and optional note.</Text>

            <TextInput
              style={styles.input}
              placeholder="What happened?"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              value={note}
              onChangeText={setNote}
              editable={!reportingBug}
              textAlignVertical="top"
            />

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={closeMenu}
                disabled={reportingBug}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.sendButton, reportingBug && styles.sendButtonDisabled]}
                onPress={() => {
                  sendBugReport().catch(console.error);
                }}
                disabled={reportingBug}
              >
                {reportingBug ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.sendButtonText}>Send Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </BugReportContext.Provider>
  );
}

export function useBugReport(): BugReportContextValue {
  const ctx = React.useContext(BugReportContext);
  if (!ctx) {
    throw new Error('useBugReport must be used within BugReportProvider');
  }
  return ctx;
}

export function BugReportFloatingButton() {
  const { openBugReport, reportingBug } = useBugReport();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (pathname === '/' || pathname === '/login') {
    return null;
  }

  const bottomOffset = 20 + insets.bottom;

  return (
    <TouchableOpacity
      style={[styles.fab, { bottom: bottomOffset }]}
      onPress={() => openBugReport()}
      accessibilityRole="button"
      accessibilityLabel="Report a bug"
      disabled={reportingBug}
    >
      {reportingBug ? (
        <ActivityIndicator color={colors.background} size="small" />
      ) : (
        <>
          <Text style={styles.fabIcon}>🐞</Text>
          <Text style={styles.fabText}>Bug</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -34 }],
    backgroundColor: colors.primary,
    borderRadius: 24,
    minHeight: 46,
    minWidth: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 999,
  },
  fabIcon: {
    fontSize: 15,
    lineHeight: 18,
  },
  fabText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
  },
  input: {
    marginTop: 12,
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelButton: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 14,
  },
});
