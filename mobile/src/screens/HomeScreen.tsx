/**
 * screens/HomeScreen.tsx
 *
 * Main landing screen — survey list with:
 *  • SyncStatusBar at the top (pending count + online/offline state)
 *  • Export GeoJSON button → downloads file and opens system Share sheet
 *  • Survey cards sorted by most-recent date
 *  • FAB to create a new survey
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Survey } from '../types';
import { getAllSurveys, deleteSurvey } from '../database/surveyDb';
import { useSyncManager } from '../hooks/useSyncManager';
import SyncStatusBar       from '../components/SyncStatusBar';
import SurveyCard          from '../components/SurveyCard';
import { useAppBootstrap } from '../context/AppBootstrapContext';
import { useAuth }         from '../context/AuthContext';
import { solarProTheme }   from '../theme/solarProTheme';
import { captureScreen } from 'react-native-view-shot';
import * as Device from 'expo-device';
import { submitBugReport } from '../api/client';

const { colors } = solarProTheme;

export default function HomeScreen() {
  const router = useRouter();
  const { ready: dbReady } = useAppBootstrap();
  const { signOut } = useAuth();
  const [surveys,      setSurveys]      = useState<Omit<Survey, 'checklist' | 'photos'>[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [reportingBug, setReportingBug] = useState(false);

  const sync = useSyncManager(dbReady);

  // ----------------------------------------------------------------
  // Load surveys from local SQLite
  // ----------------------------------------------------------------
  const loadSurveys = useCallback(async () => {
    if (!dbReady) return;
    try {
      const rows = await getAllSurveys();
      setSurveys(rows);
    } catch (err) {
      console.error('HomeScreen loadSurveys:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dbReady]);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  // Reload when the screen is navigated back to
  useFocusEffect(
    useCallback(() => {
      loadSurveys();
    }, [loadSurveys])
  );

  const handleDeleteAllSurveys = useCallback(() => {
    if (surveys.length === 0 || deleting) return;

    Alert.alert(
      'Delete All Surveys',
      `This will permanently delete ${surveys.length} local survey${surveys.length !== 1 ? 's' : ''}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await Promise.all(surveys.map((s) => deleteSurvey(s.id)));
              await loadSurveys();
            } catch (err) {
              Alert.alert(
                'Delete Failed',
                err instanceof Error ? err.message : 'Could not delete surveys.',
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [deleting, loadSurveys, surveys]);

  const handleReportBug = useCallback(() => {
    if (reportingBug) return;

    Alert.prompt?.(
      'Bug Report',
      'Optional note to include with screenshot:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async (note?: string) => {
            setReportingBug(true);
            try {
              const screenshotUri = await captureScreen({
                format: 'jpg',
                quality: 0.8,
              });

              const result = await submitBugReport({
                screenshotUri,
                title: 'Mobile Bug Report',
                description: (note || '').trim(),
                metadata: {
                  screen: 'HomeScreen',
                  appVersion: '1.0.0',
                  deviceName: Device.modelName ?? null,
                  osName: Device.osName ?? null,
                  osVersion: Device.osVersion ?? null,
                  totalSurveys: surveys.length,
                  pendingSync: sync.pending,
                  isOnline: sync.isOnline,
                  reportedAt: new Date().toISOString(),
                },
              });

              Alert.alert(
                'Bug report sent',
                `Report ${result.id} uploaded successfully.`,
              );
            } catch (err) {
              Alert.alert(
                'Bug report failed',
                err instanceof Error ? err.message : 'Unable to send bug report.',
              );
            } finally {
              setReportingBug(false);
            }
          },
        },
      ],
      'plain-text',
    );

    if (!Alert.prompt) {
      (async () => {
        setReportingBug(true);
        try {
          const screenshotUri = await captureScreen({
            format: 'jpg',
            quality: 0.8,
          });

          const result = await submitBugReport({
            screenshotUri,
            title: 'Mobile Bug Report',
            metadata: {
              screen: 'HomeScreen',
              appVersion: '1.0.0',
              deviceName: Device.modelName ?? null,
              osName: Device.osName ?? null,
              osVersion: Device.osVersion ?? null,
              totalSurveys: surveys.length,
              pendingSync: sync.pending,
              isOnline: sync.isOnline,
              reportedAt: new Date().toISOString(),
            },
          });

          Alert.alert(
            'Bug report sent',
            `Report ${result.id} uploaded successfully.`,
          );
        } catch (err) {
          Alert.alert(
            'Bug report failed',
            err instanceof Error ? err.message : 'Unable to send bug report.',
          );
        } finally {
          setReportingBug(false);
        }
      })().catch(console.error);
    }
  }, [reportingBug, surveys.length, sync.isOnline, sync.pending]);

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  if (!dbReady || loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading surveys…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Sync status banner */}
      <SyncStatusBar
        isOnline={sync.isOnline}
        pendingCount={sync.pending}
        syncingCount={sync.syncing}
        errorCount={sync.error}
        onSyncPress={sync.triggerSync}
      />

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.title}>Site Surveys</Text>
        <View style={styles.toolbarActions}>
          <TouchableOpacity
            style={[styles.bugBtn, reportingBug && styles.bugBtnDisabled]}
            onPress={handleReportBug}
            disabled={reportingBug}
          >
            {reportingBug
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.bugBtnText}>🐞 Report</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteBtn, (deleting || surveys.length === 0) && styles.deleteBtnDisabled]}
            onPress={handleDeleteAllSurveys}
            disabled={deleting || surveys.length === 0}
          >
            {deleting
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.deleteBtnText}>🗑 Delete</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => { signOut().catch(console.error); }}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Survey list */}
      <FlatList
        data={surveys}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadSurveys(); }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No surveys yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to create your first site survey</Text>
          </View>
        }
        renderItem={({ item }) => (
          <SurveyCard
            survey={item}
            onPress={() => router.push({ pathname: '/survey/[id]', params: { id: item.id } })}
          />
        )}
      />

      {/* Floating action button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/new-survey')}
        accessibilityLabel="New survey"
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: colors.background },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingText:  { marginTop: 12, color: colors.textSecondary, fontSize: 14 },
  toolbar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:   colors.card,
    borderBottomWidth:  1,
    borderBottomColor: colors.border,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  deleteBtn: {
    backgroundColor: colors.errorBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    minWidth: 90,
    alignItems: 'center',
  },
  bugBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
    minWidth: 90,
    alignItems: 'center',
  },
  bugBtnDisabled: { opacity: 0.6 },
  bugBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  logoutBtn: {
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  list:              { padding: 16, paddingBottom: 80 },
  empty: {
    alignItems:  'center',
    paddingTop:   80,
    paddingHorizontal: 32,
  },
  emptyIcon:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:    { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  fab: {
    position:        'absolute',
    bottom:           24,
    right:            24,
    width:            60,
    height:           60,
    borderRadius:     30,
    backgroundColor: colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     colors.primary,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.4,
    shadowRadius:    8,
    elevation:       6,
  },
  fabText: { color: colors.background, fontSize: 30, lineHeight: 34, fontWeight: '300' },
});
