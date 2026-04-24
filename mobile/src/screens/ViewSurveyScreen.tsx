/**

 * screens/ViewSurveyScreen.tsx
 *
 * Read-only view of a saved survey.
 * Shows all fields, GPS coordinates, checklist statuses, photo thumbnails,
 * and the sync status badge.
 * The "Sync Now" button lets the user manually push this survey to the server.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import type { Survey } from '../types';
import { getSurveyById } from '../database/surveyDb';
import { syncPending, isOnline } from '../services/SyncManager';
import { fetchReport, downloadReportMarkdown, deleteReport } from '../api/client';
import type { EngineeringReport } from '../api/client';
import { solarProTheme } from '../theme/solarProTheme';

const { colors } = solarProTheme;

const SYNC_COLORS: Record<string, string> = {
  pending: '#f59e0b', syncing: '#2563eb', synced: '#16a34a', error: '#dc2626',
};
const STATUS_COLORS: Record<string, string> = {
  pass: '#16a34a', fail: '#dc2626', 'n/a': colors.textMuted, pending: '#f59e0b',
};

export default function ViewSurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const surveyId = String(id ?? '');
  const [survey,   setSurvey]   = useState<Survey | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [syncing,  setSyncing]  = useState(false);

  // Engineering report state
  const [report,          setReport]          = useState<EngineeringReport | null>(null);
  const [reportLoading,   setReportLoading]   = useState(false);
  const [reportExpanded,  setReportExpanded]  = useState(false);
  const [markdownLoading, setMarkdownLoading] = useState(false);

  useEffect(() => {
    if (!surveyId) {
      Alert.alert('Error', 'Missing survey id');
      setLoading(false);
    }
  }, [surveyId]);

  const loadSurvey = useCallback(async () => {
    if (!surveyId) {
      return;
    }
    try {
      const s = await getSurveyById(surveyId);
      setSurvey(s);
    } catch (err) {
      console.error('ViewSurveyScreen loadSurvey:', err);
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => { loadSurvey(); }, [loadSurvey]);

  async function handleSync() {
    if (!isOnline()) {
      Alert.alert('Offline', 'Connect to the internet to sync this survey.');
      return;
    }
    setSyncing(true);
    try {
      await syncPending();
      await loadSurvey();   // reload to show updated sync_status
    } catch (err) {
      Alert.alert('Sync Error', err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleGenerateReport() {
    if (!isOnline()) {
      Alert.alert('Offline', 'An internet connection is required to generate the report.');
      return;
    }
    setReportLoading(true);
    try {
      const r = await fetchReport(surveyId);
      setReport(r);
      setReportExpanded(true);
    } catch (err) {
      Alert.alert('Report Error', err instanceof Error ? err.message : String(err));
    } finally {
      setReportLoading(false);
    }
  }

  async function handleDownloadMarkdown() {
    if (!isOnline()) {
      Alert.alert('Offline', 'An internet connection is required to download the report.');
      return;
    }
    setMarkdownLoading(true);
    try {
      const md = await downloadReportMarkdown(surveyId);
      // Share the Markdown text via the system share sheet
      try {
        const { Share } = await import('react-native');
        await Share.share({
          title:   `Engineering Report — ${survey?.project_name ?? surveyId}`,
          message: md,
        });
      } catch {
        // Fallback: show in alert (truncated) so the user can at least read it
        Alert.alert('Report Downloaded', md.substring(0, 500) + '…');
      }
    } catch (err) {
      Alert.alert('Download Error', err instanceof Error ? err.message : String(err));
    } finally {
      setMarkdownLoading(false);
    }
  }

  async function handleDeleteReport() {
    if (!isOnline()) {
      Alert.alert('Offline', 'An internet connection is required to delete the report.');
      return;
    }

    Alert.alert('Delete Report', 'Remove the generated report from this view?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReport(surveyId);
            setReport(null);
            setReportExpanded(false);
            Alert.alert('Report Deleted', 'The report was removed.');
          } catch (err) {
            Alert.alert('Delete Error', err instanceof Error ? err.message : String(err));
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!survey) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Survey not found.</Text>
      </SafeAreaView>
    );
  }

  const syncColor = SYNC_COLORS[survey.sync_status] ?? colors.textMuted;
  const formattedDate = new Date(survey.survey_date).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.projectName}>{survey.project_name}</Text>
            <View style={[styles.syncBadge, { backgroundColor: syncColor }]}>
              <Text style={styles.syncBadgeText}>{survey.sync_status.toUpperCase()}</Text>
            </View>
          </View>

          {survey.category_name && (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{survey.category_name}</Text>
            </View>
          )}

          <Row label="Site"      value={survey.site_name} />
          {!!survey.site_address && <Row label="Address"   value={survey.site_address} />}
          <Row label="Inspector" value={survey.inspector_name} />
          <Row label="Date"      value={formattedDate} />

          {/* GPS */}
          {survey.latitude != null && survey.longitude != null ? (
            <View style={styles.gpsBox}>
              <Text style={styles.gpsTitle}>📍 GPS Coordinates</Text>
              <Text style={styles.gpsCoords}>
                {survey.latitude.toFixed(6)}, {survey.longitude.toFixed(6)}
              </Text>
              {survey.gps_accuracy != null && (
                <Text style={styles.gpsAccuracy}>
                  ± {survey.gps_accuracy.toFixed(1)} m accuracy
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.noGps}>No GPS coordinates recorded</Text>
          )}
        </View>

        {/* Notes */}
        {!!survey.notes && (
          <Section title="Notes">
            <Text style={styles.notes}>{survey.notes}</Text>
          </Section>
        )}

        {/* Solar metadata */}
        {survey.metadata && (
          <Section title="📐 Installation Specifications">
            {Object.entries(survey.metadata)
              .filter(([k]) => k !== 'type')
              .map(([k, v]) => (
                <View key={k} style={styles.row}>
                  <Text style={styles.rowLabel}>
                    {k.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.rowValue}>
                    {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '—')}
                  </Text>
                </View>
              ))
            }
          </Section>
        )}

        {/* Checklist */}
        {survey.checklist.length > 0 && (
          <Section title={`Checklist (${survey.checklist.length})`}>
            {survey.checklist.map((item) => (
              <View key={item.id} style={styles.checkRow}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] ?? '#6b7280' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>{item.label}</Text>
                  {!!item.notes && <Text style={styles.checkNotes}>{item.notes}</Text>}
                </View>
                <Text style={[styles.checkStatus, { color: STATUS_COLORS[item.status] ?? '#6b7280' }]}>
                  {item.status.toUpperCase()}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {/* Photos */}
        {survey.photos.length > 0 && (
          <Section title={`Photos (${survey.photos.length})`}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {survey.photos.map((photo) => (
                <View key={photo.id} style={styles.photoItem}>
                  <Image source={{ uri: photo.file_path }} style={styles.photo} />
                  {!!photo.label && (
                    <Text style={styles.photoLabel} numberOfLines={1}>{photo.label}</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </Section>
        )}

        {/* Sync error */}
        {survey.sync_status === 'error' && survey.sync_error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxTitle}>Sync Error</Text>
            <Text style={styles.errorBoxText}>{survey.sync_error}</Text>
          </View>
        )}

        {/* Sync button */}
        {survey.sync_status !== 'synced' && (
          <TouchableOpacity
            style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
            onPress={handleSync}
            disabled={syncing}
          >
            {syncing
              ? <ActivityIndicator color={colors.white} size="small" />
              : <Text style={styles.syncBtnText}>⬆ Sync to Server</Text>
            }
          </TouchableOpacity>
        )}

        {/* ── Engineering Report ──────────────────────────── */}
        <TouchableOpacity
          style={[styles.reportBtn, reportLoading && styles.reportBtnDisabled]}
          onPress={handleGenerateReport}
          disabled={reportLoading}
        >
          {reportLoading
            ? <ActivityIndicator color={colors.white} size="small" />
            : <Text style={styles.reportBtnText}>📊 Generate Design Report</Text>
          }
        </TouchableOpacity>

        {report && reportExpanded && (
          <ReportCard
            report={report}
            markdownLoading={markdownLoading}
            onDownload={handleDownloadMarkdown}
            onDismiss={() => setReportExpanded(false)}
            onDelete={handleDeleteReport}
          />
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Report Card ────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  High:   '#dc2626',
  Medium: '#f59e0b',
  Low:    '#16a34a',
  None:   '#6b7280',
};

const PRIORITY_COLOR: Record<string, string> = {
  High:   '#dc2626',
  Medium: '#f59e0b',
  Low:    '#16a34a',
};

function ReportCard({
  report,
  markdownLoading,
  onDownload,
  onDismiss,
  onDelete,
}: {
  report:          EngineeringReport;
  markdownLoading: boolean;
  onDownload:      () => void;
  onDismiss:       () => void;
  onDelete:        () => void;
}) {
  const riskColor = RISK_COLOR[report.overall_risk] ?? '#6b7280';
  const cs = report.checklist_summary;

  return (
    <View style={reportStyles.card}>
      {/* Header */}
      <View style={reportStyles.header}>
        <Text style={reportStyles.title}>📊 Engineering Assessment</Text>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={reportStyles.dismiss}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Overall risk badge */}
      <View style={[reportStyles.riskBadge, { backgroundColor: riskColor + '20', borderColor: riskColor }]}>
        <Text style={[reportStyles.riskText, { color: riskColor }]}>
          Overall Risk: {report.overall_risk}
        </Text>
      </View>

      {/* Flags */}
      {report.flags.length > 0 ? (
        <View style={reportStyles.section}>
          <Text style={reportStyles.sectionTitle}>⚠ Design Flags</Text>
          {report.flags.map((flag, i) => (
            <View key={i} style={[reportStyles.flagRow, { borderLeftColor: PRIORITY_COLOR[flag.priority] ?? '#6b7280' }]}>
              <Text style={[reportStyles.flagPriority, { color: PRIORITY_COLOR[flag.priority] ?? '#6b7280' }]}>
                {flag.priority} — {flag.category}
              </Text>
              <Text style={reportStyles.flagMessage}>{flag.message}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={reportStyles.noFlags}>✅ No critical design flags identified.</Text>
      )}

      {/* Recommendations */}
      <View style={reportStyles.section}>
        <Text style={reportStyles.sectionTitle}>📋 Recommendations</Text>
        {report.recommendations.map((rec, i) => (
          <Text key={i} style={reportStyles.rec}>• {rec}</Text>
        ))}
      </View>

      {/* Checklist summary */}
      {cs.total > 0 && (
        <View style={reportStyles.summaryRow}>
          <SummaryCell label="Pass"    count={cs.pass}    color="#16a34a" />
          <SummaryCell label="Fail"    count={cs.fail}    color="#dc2626" />
          <SummaryCell label="Pending" count={cs.pending} color="#f59e0b" />
          <SummaryCell label="N/A"     count={cs.na}      color="#6b7280" />
        </View>
      )}

      {/* Download Markdown */}
      <TouchableOpacity
        style={[reportStyles.downloadBtn, markdownLoading && reportStyles.downloadBtnDisabled]}
        onPress={onDownload}
        disabled={markdownLoading}
      >
        {markdownLoading
          ? <ActivityIndicator color={colors.background} size="small" />
          : <Text style={reportStyles.downloadBtnText}>⬇ Share Markdown Report</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity
        style={reportStyles.deleteBtn}
        onPress={onDelete}
      >
        <Text style={reportStyles.deleteBtnText}>🗑 Delete Report</Text>
      </TouchableOpacity>
    </View>
  );
}

function SummaryCell({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={reportStyles.summaryCell}>
      <Text style={[reportStyles.summaryCount, { color }]}>{count}</Text>
      <Text style={reportStyles.summaryLabel}>{label}</Text>
    </View>
  );
}

// ── Small helpers ──────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: colors.background },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:     { padding: 16, paddingBottom: 46 },
  errorText:  { color: colors.errorText, fontSize: 16 },

  headerCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius:     14,
    padding:         16,
    marginBottom:    12,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    6,
    elevation:       2,
  },
  headerTop: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'flex-start',
    marginBottom:     8,
  },
  projectName:   { fontSize: 21, fontWeight: '800', color: colors.textPrimary, flex: 1, marginRight: 8 },
  syncBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  syncBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  categoryTag: {
    alignSelf:         'flex-start',
    backgroundColor:   colors.inputBg,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    paddingHorizontal:  10,
    paddingVertical:     4,
    borderRadius:       12,
    marginBottom:        10,
  },
  categoryTagText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  row:       { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel:  { width: 82, fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  rowValue:  { flex: 1, fontSize: 13, color: colors.textSecondary },
  gpsBox: {
    backgroundColor: colors.successBg,
    borderRadius:     10,
    padding:          10,
    marginTop:        10,
    borderWidth:      1,
    borderColor:      colors.successBorder,
  },
  gpsTitle:     { fontSize: 13, fontWeight: '700', color: colors.successText, marginBottom: 4 },
  gpsCoords:    { fontSize: 14, color: colors.successText, fontFamily: 'monospace', fontWeight: '700' },
  gpsAccuracy:  { fontSize: 11, color: colors.successText, marginTop: 2 },
  noGps:        { fontSize: 12, color: colors.textMuted, marginTop: 10, fontStyle: 'italic' },

  section: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius:    12,
    padding:         14,
    marginBottom:    12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 },
  notes:        { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  checkRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap:             8,
  },
  statusDot:    { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  checkLabel:   { fontSize: 14, color: colors.textSecondary, fontWeight: '700' },
  checkNotes:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  checkStatus:  { fontSize: 11, fontWeight: '800', marginTop: 3 },

  photoItem:    { marginRight: 10, alignItems: 'center', width: 120 },
  photo:        { width: 120, height: 90, borderRadius: 8, backgroundColor: colors.inputBg },
  photoLabel:   { fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: 'center' },

  errorBox: {
    backgroundColor: colors.errorBg,
    borderRadius:    10,
    padding:         12,
    borderWidth:     1,
    borderColor:     colors.errorBorder,
    marginBottom:    12,
  },
  errorBoxTitle: { fontSize: 14, fontWeight: '700', color: colors.errorText, marginBottom: 4 },
  errorBoxText:  { fontSize: 13, color: colors.errorText },

  syncBtn: {
    backgroundColor: colors.primary,
    paddingVertical:  16,
    borderRadius:    12,
    alignItems:      'center',
    marginTop:        8,
    minHeight:        52,
    justifyContent:  'center',
  },
  syncBtnDisabled: { backgroundColor: colors.primaryDark },
  syncBtnText:     { color: colors.white, fontWeight: '700', fontSize: 16 },

  reportBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  reportBtnDisabled: { backgroundColor: colors.primaryDark },
  reportBtnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
});

const reportStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  dismiss: { fontSize: 18, color: colors.textMuted, fontWeight: '700' },
  riskBadge: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  riskText: { fontSize: 13, fontWeight: '700' },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  flagRow: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginBottom: 8,
  },
  flagPriority: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  flagMessage: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  noFlags: { fontSize: 13, color: '#16a34a', fontWeight: '600', marginTop: 8 },
  rec: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 10,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  downloadBtn: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  downloadBtnDisabled: { opacity: 0.6 },
  downloadBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  deleteBtn: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorBg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteBtnText: { color: colors.errorText, fontWeight: '700', fontSize: 14 },
});
