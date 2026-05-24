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
  Alert, StyleSheet, RefreshControl, Platform,
} from 'react-native';
import {
  nativeApplicationVersion,
  nativeBuildVersion,
} from 'expo-application';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Survey } from '../types';
import { getAllSurveys, deleteSurvey, deleteUnsyncedSurveys } from '../database/surveyDb';
import { deleteRemoteSurvey } from '../api/client';
import { useSyncManager } from '../hooks/useSyncManager';
import SyncStatusBar       from '../components/SyncStatusBar';
import SurveyCard          from '../components/SurveyCard';
import { useAppBootstrap } from '../context/AppBootstrapContext';
import { useAuth }         from '../context/AuthContext';
import { useBugReport } from '../context/BugReportContext';
import { solarProTheme }   from '../theme/solarProTheme';

const { colors } = solarProTheme;
type SurveyListItem = Omit<Survey, 'checklist' | 'photos'>;

export default function HomeScreen() {
  const router = useRouter();
  const { ready: dbReady } = useAppBootstrap();
  const { signOut } = useAuth();
  const { openBugReport, reportingBug } = useBugReport();
  const [surveys,      setSurveys]      = useState<SurveyListItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [deletingSurveyId, setDeletingSurveyId] = useState<string | null>(null);
  const [clearingUnsynced, setClearingUnsynced] = useState(false);

  const sync = useSyncManager(dbReady);
  const canResync = sync.isOnline && sync.syncing === 0;

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

  const handleClearUnsynced = useCallback(() => {
    if (sync.unsyncedCount === 0 || clearingUnsynced) return;

    Alert.alert(
      'Clear Unsynced Surveys',
      `This will remove ${sync.unsyncedCount} unsynced local survey${sync.unsyncedCount !== 1 ? 's' : ''} (pending, syncing, or failed). Synced surveys will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Unsynced',
          style: 'destructive',
          onPress: async () => {
            setClearingUnsynced(true);
            try {
              const removed = await deleteUnsyncedSurveys();
              await loadSurveys();
              await sync.refreshStatus();
              Alert.alert('Unsynced Cleared', `Removed ${removed} unsynced survey${removed !== 1 ? 's' : ''}.`);
            } catch (err) {
              Alert.alert(
                'Clear Failed',
                err instanceof Error ? err.message : 'Could not clear unsynced surveys.',
              );
            } finally {
              setClearingUnsynced(false);
            }
          },
        },
      ],
    );
  }, [clearingUnsynced, loadSurveys, sync]);

  const handleDeleteSurvey = useCallback((survey: SurveyListItem) => {
    if (deletingSurveyId) return;

    const deletingSynced = survey.sync_status === 'synced';
    const warning = deletingSynced
      ? 'This survey is synced. It will be deleted from both app and server.'
      : 'This will permanently delete this local survey.';

    Alert.alert(
      'Delete Survey',
      warning,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingSurveyId(survey.id);
            try {
              if (deletingSynced) {
                if (!sync.isOnline) {
                  throw new Error('Connect to the internet to delete synced surveys.');
                }
                await deleteRemoteSurvey(survey.id);
              }

              await deleteSurvey(survey.id);
              await loadSurveys();
              await sync.refreshStatus();
            } catch (err) {
              Alert.alert(
                'Delete Failed',
                err instanceof Error ? err.message : 'Could not delete this survey.',
              );
            } finally {
              setDeletingSurveyId(null);
            }
          },
        },
      ],
    );
  }, [deletingSurveyId, loadSurveys, sync]);

  const versionLabel = useMemo(() => {
    const installedVersion = nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'unknown';
    const installedBuild = nativeBuildVersion
      ?? (Platform.OS === 'android'
        ? Constants.expoConfig?.android?.versionCode?.toString()
        : Constants.expoConfig?.ios?.buildNumber)
      ?? 'unknown';

    return `v${installedVersion} (${installedBuild})`;
  }, []);

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
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Solar-Pro Site Survey</Text>
          <Text style={styles.subtitle}>
            {surveys.length} total · {sync.unsyncedCount} unsynced
          </Text>
          <Text style={styles.versionBadge}>{versionLabel}</Text>
        </View>
        <View style={styles.toolbarActions}>
          <TouchableOpacity
            style={[styles.resyncBtn, !canResync && styles.resyncBtnDisabled]}
            onPress={() => { sync.triggerSync().catch(console.error); }}
            disabled={!canResync}
          >
            {sync.syncing > 0
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.resyncBtnText}>↻ Re-sync</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bugBtn, reportingBug && styles.bugBtnDisabled]}
            onPress={() => {
              openBugReport({
                metadata: {
                  screen: 'HomeScreen',
                  totalSurveys: surveys.length,
                  pendingSync: sync.pending,
                  isOnline: sync.isOnline,
                },
              });
            }}
            disabled={reportingBug}
          >
            {reportingBug
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.bugBtnText}>🐞 Report</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.clearUnsyncedBtn, (clearingUnsynced || sync.unsyncedCount === 0) && styles.clearUnsyncedBtnDisabled]}
            onPress={handleClearUnsynced}
            disabled={clearingUnsynced || sync.unsyncedCount === 0}
          >
            {clearingUnsynced
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.clearUnsyncedBtnText}>🧹 Clear Unsynced</Text>
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
            onDelete={() => handleDeleteSurvey(item)}
            deleting={deletingSurveyId === item.id}
            deleteDisabled={!!deletingSurveyId}
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    gap: 10,
  },
  titleBlock: {
    width: '100%',
    alignItems: 'center',
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  versionBadge: {
    marginTop: 6,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#0F1A33',
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  resyncBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resyncBtnDisabled: { opacity: 0.6 },
  resyncBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  clearUnsyncedBtn: {
    backgroundColor: '#b45309',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearUnsyncedBtnDisabled: { opacity: 0.6 },
  clearUnsyncedBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  bugBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bugBtnDisabled: { opacity: 0.6 },
  bugBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  logoutBtn: {
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 38,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  list:              { padding: 16, paddingBottom: 90 },
  empty: {
    alignItems:  'center',
    paddingTop:   84,
    paddingHorizontal: 32,
  },
  emptyIcon:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:    { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  fab: {
    position:        'absolute',
    bottom:           Platform.OS === 'android' ? 88 : 28,
    right:            24,
    width:            62,
    height:           62,
    borderRadius:     31,
    backgroundColor: colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     colors.primary,
    shadowOffset:    { width: 0, height: 8 },
    shadowOpacity:   0.28,
    shadowRadius:    12,
    elevation:       7,
  },
  fabText: { color: '#0B1220', fontSize: 32, lineHeight: 36, fontWeight: '700' },
});
