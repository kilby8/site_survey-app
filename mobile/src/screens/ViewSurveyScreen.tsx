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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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
      const safeProject = (survey?.project_name ?? 'project')
        .replace(/[^a-zA-Z0-9-_]+/g, '_')
        .slice(0, 40);
      const filename = `design-report-${safeProject}-${surveyId.slice(0, 8)}.md`;
      const uri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}${filename}`;

      if (!uri) {
        Alert.alert('Report Ready', md.substring(0, 500) + '…');
        return;
      }

      await FileSystem.writeAsStringAsync(uri, md, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/markdown',
          dialogTitle: 'Export Design Report',
          UTI: 'public.plain-text',
        });
      } else {
        Alert.alert('Report Saved', `Saved report file:\n${uri}`);
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

          <Row label="Site"      value={survey.site_name ?? ""} />
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
            survey={survey}
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

const PIPELINE_PHASES: Array<{ key: string; labels: string[] }> = [
  { key: 'Arrival', labels: ['Arrival: Address Verification', 'Arrival: Attic Access', 'Arrival: Hazards Logged'] },
  { key: 'Walkaround', labels: ['Walk Around', 'Walk Around: CAD Context Wide Shots'] },
  { key: 'Utility', labels: ['Utility: Meter', 'Utility: Service Entry'] },
  { key: 'Electrical', labels: ['Electrical'] },
  { key: 'Roof', labels: ['Roof: Plane Pitch/Azimuth/Obstructions', 'Roof: Plane Material + Plane ID Association'] },
];

function ReportCard({
  survey,
  report,
  markdownLoading,
  onDownload,
  onDismiss,
  onDelete,
}: {
  survey:          Survey;
  report:          EngineeringReport;
  markdownLoading: boolean;
  onDownload:      () => void;
  onDismiss:       () => void;
  onDelete:        () => void;
}) {
  const riskColor = RISK_COLOR[report.overall_risk] ?? '#6b7280';
  const cs = report.checklist_summary;
  const generatedAt = new Date(report.generated_at).toLocaleString();
  const surveyDate = new Date(report.survey_date).toLocaleDateString();

  const mediaSummary = survey.photos.reduce(
    (acc, photo) => {
      if (photo.mime_type?.startsWith('video/')) acc.video += 1;
      else acc.image += 1;
      return acc;
    },
    { image: 0, video: 0 },
  );

  const mediaByLabel = survey.photos.reduce<Record<string, number>>((acc, photo) => {
    const key = photo.label?.trim();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({
    Arrival: true,
    Walkaround: true,
    Utility: true,
    Electrical: true,
    Roof: true,
  });

  const phaseStatus = PIPELINE_PHASES.map((phase) => {
    const items = survey.checklist.filter((item) => phase.labels.includes(item.label));
    const total = items.length;
    const pass = items.filter((item) => item.status === 'pass').length;
    const fail = items.filter((item) => item.status === 'fail').length;
    const readiness = total === 0 ? 'NOT WIRED' : fail > 0 ? 'PARTIAL' : pass === total ? 'LIVE' : 'PARTIAL';
    return { ...phase, total, pass, fail, readiness };
  });

  const togglePhase = (key: string) => {
    setExpandedPhases((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <View style={reportStyles.card}>
      <View style={reportStyles.coverCard}>
        <Text style={reportStyles.coverKicker}>SOLARPRO</Text>
        <Text style={reportStyles.coverTitle}>Site Survey Design Report</Text>
        <Text style={reportStyles.coverSub}>CAD / Permit / Engineering Ready Packet</Text>
        <View style={reportStyles.coverMetaRow}>
          <Text style={reportStyles.coverMeta}>Survey ID: {report.survey_id.slice(0, 8).toUpperCase()}</Text>
          <Text style={reportStyles.coverMeta}>Category: {report.category ?? 'Unspecified'}</Text>
        </View>
      </View>

      {/* Header */}
      <View style={reportStyles.header}>
        <Text style={reportStyles.title}>📊 Comprehensive Design Report</Text>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={reportStyles.dismiss}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={reportStyles.metaCard}>
        <Text style={reportStyles.metaTitle}>Executive Summary</Text>
        <Text style={reportStyles.metaText}>Project: {report.project_name}</Text>
        <Text style={reportStyles.metaText}>Inspector: {report.inspector_name}</Text>
        <Text style={reportStyles.metaText}>Survey Date: {surveyDate}</Text>
        <Text style={reportStyles.metaText}>Generated: {generatedAt}</Text>
        {!!report.site_address && <Text style={reportStyles.metaText}>Address: {report.site_address}</Text>}
      </View>

      {/* Overall risk badge */}
      <View style={[reportStyles.riskBadge, { backgroundColor: riskColor + '20', borderColor: riskColor }]}>
        <Text style={[reportStyles.riskText, { color: riskColor }]}>
          Overall Risk: {report.overall_risk}
        </Text>
      </View>

      <View style={reportStyles.section}>
        <Text style={reportStyles.sectionTitle}>Mission Control Pipeline Readiness</Text>
        {phaseStatus.map((phase) => (
          <View key={phase.key} style={reportStyles.pipelineRow}>
            <Text style={reportStyles.pipelineLabel}>{phase.key}</Text>
            <Text style={[
              reportStyles.pipelineBadge,
              phase.readiness === 'LIVE' ? reportStyles.pipelineLive : phase.readiness === 'PARTIAL' ? reportStyles.pipelinePartial : reportStyles.pipelineNotWired,
            ]}>
              {phase.readiness}
            </Text>
            <Text style={reportStyles.pipelineDetail}>{phase.pass}/{phase.total} pass</Text>
          </View>
        ))}
      </View>

      <View style={reportStyles.section}>
        <Text style={reportStyles.sectionTitle}>Evidence Summary</Text>
        <View style={reportStyles.summaryRow}>
          <SummaryCell label="Images" count={mediaSummary.image} color="#2563eb" />
          <SummaryCell label="Videos" count={mediaSummary.video} color="#9333ea" />
          <SummaryCell label="Flags" count={report.flags.length} color={riskColor} />
          <SummaryCell label="Checklist" count={cs.total} color="#0f766e" />
        </View>
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

      <View style={reportStyles.section}>
        <Text style={reportStyles.sectionTitle}>Checklist Evidence Matrix by Phase</Text>
        {phaseStatus.map((phase) => {
          const phaseItems = survey.checklist.filter((item) => phase.labels.includes(item.label));
          if (phaseItems.length === 0) return null;

          return (
            <View key={phase.key} style={reportStyles.phaseCard}>
              <TouchableOpacity style={reportStyles.phaseHeader} onPress={() => togglePhase(phase.key)}>
                <Text style={reportStyles.phaseTitle}>{phase.key}</Text>
                <View style={reportStyles.phaseHeaderRight}>
                  <Text style={[
                    reportStyles.pipelineBadge,
                    phase.readiness === 'LIVE' ? reportStyles.pipelineLive : phase.readiness === 'PARTIAL' ? reportStyles.pipelinePartial : reportStyles.pipelineNotWired,
                  ]}>
                    {phase.readiness}
                  </Text>
                  <Text style={reportStyles.phaseChevron}>{expandedPhases[phase.key] ? '▾' : '▸'}</Text>
                </View>
              </TouchableOpacity>

              {expandedPhases[phase.key] && phaseItems.map((item) => {
                const evidenceCount = mediaByLabel[item.label] ?? 0;
                const statusColor = PRIORITY_COLOR[item.status === 'fail' ? 'High' : item.status === 'pending' ? 'Medium' : 'Low'] ?? '#6b7280';
                return (
                  <View key={item.id} style={reportStyles.matrixRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={reportStyles.matrixLabel}>{item.label}</Text>
                      {!!item.notes && <Text style={reportStyles.matrixNotes}>{item.notes}</Text>}
                    </View>
                    <Text style={[reportStyles.matrixStatus, { color: statusColor }]}>{item.status.toUpperCase()}</Text>
                    <Text style={reportStyles.matrixEvidence}>{evidenceCount} media</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>

      {/* Download Markdown */}
      <TouchableOpacity
        style={[reportStyles.downloadBtn, markdownLoading && reportStyles.downloadBtnDisabled]}
        onPress={onDownload}
        disabled={markdownLoading}
      >
        {markdownLoading
          ? <ActivityIndicator color={colors.background} size="small" />
          : <Text style={reportStyles.downloadBtnText}>⬇ Export Design Report (.md)</Text>
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
  coverCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#0f172a',
    padding: 12,
    marginBottom: 12,
  },
  coverKicker: { color: '#93c5fd', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  coverTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginTop: 4 },
  coverSub: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
  coverMetaRow: { marginTop: 10, gap: 2 },
  coverMeta: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  dismiss: { fontSize: 18, color: colors.textMuted, fontWeight: '700' },
  metaCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    padding: 10,
    marginBottom: 10,
  },
  metaTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  metaText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
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
  pipelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
    gap: 8,
  },
  pipelineLabel: { flex: 1, fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  pipelineBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pipelineLive: { backgroundColor: '#14532d', color: '#86efac' },
  pipelinePartial: { backgroundColor: '#78350f', color: '#fde68a' },
  pipelineNotWired: { backgroundColor: '#374151', color: '#d1d5db' },
  pipelineDetail: { fontSize: 11, color: colors.textMuted, width: 70, textAlign: 'right' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 10,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  phaseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.inputBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  phaseTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  phaseHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phaseChevron: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  matrixLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  matrixNotes: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  matrixStatus: { width: 68, textAlign: 'right', fontSize: 11, fontWeight: '800' },
  matrixEvidence: { width: 62, textAlign: 'right', fontSize: 11, color: colors.textMuted },
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
