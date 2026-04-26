import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Survey, ChecklistItem, ChecklistStatus,
  Photo, GpsCoordinates, DEFAULT_CHECKLIST_ITEMS,
} from '../types/survey';
import { createSurvey, updateSurvey, fetchSurvey } from '../api/surveyApi';
import './SurveyFormV2.css';

// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Site Info' },
  { id: 2, label: 'Checklist' },
  { id: 3, label: 'Photos' },
  { id: 4, label: 'Review' },
];

const PHOTO_SLOTS: { key: string; label: string; required: boolean; icon: string }[] = [
  { key: 'site_overview', label: 'Site Overview', required: true,  icon: '🏠' },
  { key: 'power_supply',  label: 'Power Supply',  required: true,  icon: '⚡' },
  { key: 'network',       label: 'Network / Comms',required: false, icon: '📡' },
  { key: 'safety_hazard', label: 'Safety / Hazard',required: false, icon: '⚠️' },
  { key: 'equipment',     label: 'Equipment',      required: false, icon: '🔧' },
  { key: 'documentation', label: 'Documentation',  required: false, icon: '📋' },
  { key: 'access_point',  label: 'Access Point',   required: false, icon: '🚪' },
  { key: 'additional',    label: 'Additional',      required: false, icon: '📷' },
];

const PROJECT_TYPE_OPTIONS = [
  { value: 'Solar Install',   icon: '☀️', color: 'yellow' },
  { value: 'Battery Storage', icon: '🔋', color: 'green'  },
  { value: 'EV Charger',      icon: '⚡', color: 'cyan'   },
  { value: 'Panel Upgrade',   icon: '🔌', color: 'blue'   },
  { value: 'Maintenance',     icon: '🔧', color: ''       },
  { value: 'Inspection',      icon: '🔍', color: ''       },
];

// Status metadata: icon, micro-feedback text
const STATUS_META: Record<ChecklistStatus, { icon: string; micro: string; colorClass: string }> = {
  pass:    { icon: '✅', micro: 'Good condition',    colorClass: 'pass'    },
  fail:    { icon: '❌', micro: 'Needs attention',   colorClass: 'fail'    },
  'n/a':   { icon: '⚪', micro: 'Not applicable',    colorClass: 'na'      },
  pending: { icon: '⏳', micro: 'Awaiting review',   colorClass: 'pending' },
};

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
interface Props {
  surveyId?: string;
  onSaved:   (survey: Survey) => void;
  onCancel:  () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type SlotPhotoMap = Record<string, Photo | null>;

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileToPhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve({
      id: generateId(), name: file.name,
      dataUrl: e.target?.result as string,
      capturedAt: new Date().toISOString(),
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildInitialSlotMap(photos: Photo[]): SlotPhotoMap {
  const map: SlotPhotoMap = {};
  PHOTO_SLOTS.forEach((s) => { map[s.key] = null; });
  photos.forEach((p) => {
    const key = PHOTO_SLOTS.find((s) => p.name.startsWith(s.key + '_'))?.key;
    if (key) map[key] = p;
  });
  return map;
}

// ─────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────

/** Premium chip selector */
function ChipGroup({
  options, value, onChange, cols = 2,
}: {
  options: { value: string; icon?: string; color?: string }[];
  value: string;
  onChange: (v: string) => void;
  cols?: 2 | 3 | 4;
}) {
  return (
    <div className={`sv2-chip-group sv2-chip-group--grid${cols}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={[
            'sv2-chip',
            o.color ? `sv2-chip--${o.color}` : '',
            value === o.value ? 'sv2-chip--selected' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <span className="sv2-chip-icon">{o.icon}</span>}
          {o.value}
        </button>
      ))}
    </div>
  );
}

/** Premium checklist card — tap anywhere to cycle status */
function CheckCard({
  item, onChange,
}: {
  item: ChecklistItem;
  onChange: (updated: ChecklistItem) => void;
}) {
  const CYCLE_ORDER: ChecklistStatus[] = ['pending', 'pass', 'fail', 'n/a'];
  const meta = STATUS_META[item.status];
  const cssStatus = item.status === 'n/a' ? 'na' : item.status;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't cycle if clicking the notes input or the chip buttons
    const target = e.target as HTMLElement;
    if (target.closest('.sv2-check-notes-input') || target.closest('.sv2-check-chip')) return;
    const next = CYCLE_ORDER[(CYCLE_ORDER.indexOf(item.status) + 1) % CYCLE_ORDER.length];
    onChange({ ...item, status: next });
  };

  const statuses: { key: ChecklistStatus; label: string }[] = [
    { key: 'pass',    label: '✓ Pass' },
    { key: 'fail',    label: '✕ Fail' },
    { key: 'n/a',     label: 'N/A'    },
    { key: 'pending', label: '…'      },
  ];

  return (
    <div
      className={`sv2-check-card sv2-check-card--${cssStatus}`}
      onClick={handleCardClick}
    >
      <div className="sv2-check-top">
        {/* Status icon circle */}
        <div className="sv2-check-icon">{meta.icon}</div>

        {/* Label + micro-feedback */}
        <div className="sv2-check-content">
          <span className="sv2-check-label">{item.label}</span>
          <span className={`sv2-check-micro sv2-check-micro--${cssStatus}`}>
            {meta.micro}
          </span>
        </div>

        {/* Status chips */}
        <div className="sv2-check-chips">
          {statuses.map((s) => {
            const css = s.key === 'n/a' ? 'na' : s.key;
            return (
              <button
                key={s.key}
                type="button"
                className={[
                  'sv2-check-chip',
                  `sv2-check-chip--${css}`,
                  item.status === s.key ? 'sv2-check-chip--active' : '',
                ].filter(Boolean).join(' ')}
                onClick={(e) => { e.stopPropagation(); onChange({ ...item, status: s.key }); }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inline notes */}
      <div className="sv2-check-notes">
        <input
          type="text"
          className="sv2-check-notes-input"
          placeholder="Add a note…"
          value={item.notes}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ ...item, notes: e.target.value })}
        />
      </div>
    </div>
  );
}

/** Premium photo slot with animation states */
function PhotoSlot({
  slot, photo, onCapture, onRemove,
}: {
  slot: (typeof PHOTO_SLOTS)[number];
  photo: Photo | null;
  onCapture: (file: File, slotKey: string) => void;
  onRemove: (slotKey: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={[
        'sv2-photo-slot',
        photo ? 'sv2-photo-slot--filled' : 'sv2-photo-slot--empty',
        slot.required && !photo ? 'sv2-photo-slot--required' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => !photo && inputRef.current?.click()}
    >
      {!photo ? (
        <>
          <span className="sv2-slot-icon">{slot.icon}</span>
          <span className="sv2-slot-label">{slot.label}</span>
          <span className="sv2-slot-camera">📷</span>
          {slot.required && (
            <span className="sv2-slot-required-badge">REQ</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sv2-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCapture(file, slot.key);
            }}
          />
        </>
      ) : (
        <>
          <img src={photo.dataUrl} alt={slot.label} />
          {/* Checkmark overlay — animated in */}
          <div className="sv2-slot-check">✓</div>
          <div className="sv2-slot-overlay">
            <span className="sv2-slot-overlay-label">{slot.label}</span>
            <button
              type="button"
              className="sv2-slot-remove"
              onClick={(e) => { e.stopPropagation(); onRemove(slot.key); }}
            >
              ✕
            </button>
          </div>
          {slot.required && (
            <span className="sv2-slot-required-badge sv2-slot-required-badge--done">✓</span>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────────────────────────
export default function SurveyFormV2({ surveyId, onSaved, onCancel }: Props) {
  const [step, setStep]             = useState(1);
  const [animKey, setAnimKey]       = useState(0); // triggers step animation
  const [loading, setLoading]       = useState(!!surveyId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [submittedSurvey, setSubmittedSurvey] = useState<Survey | null>(null);

  // ── Form state ──
  const [title,         setTitle]         = useState('');
  const [projectType,   setProjectType]   = useState('');
  const [siteName,      setSiteName]      = useState('');
  const [siteAddress,   setSiteAddress]   = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [dateTime,      setDateTime]      = useState(new Date().toISOString().slice(0, 16));
  const [gps,           setGps]           = useState<GpsCoordinates | null>(null);
  const [gpsLoading,    setGpsLoading]    = useState(false);
  const [checklist,     setChecklist]     = useState<ChecklistItem[]>(() =>
    DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item, id: generateId() }))
  );
  const [notes,    setNotes]    = useState('');
  const [slotMap,  setSlotMap]  = useState<SlotPhotoMap>(() => {
    const m: SlotPhotoMap = {};
    PHOTO_SLOTS.forEach((s) => { m[s.key] = null; });
    return m;
  });

  const savedIdRef = useRef<string | undefined>(surveyId);

  // ── Load existing survey ──
  useEffect(() => {
    if (!surveyId) return;
    (async () => {
      try {
        const survey = await fetchSurvey(surveyId);
        setTitle(survey.title);
        setSiteName(survey.siteName);
        setSiteAddress(survey.siteAddress);
        setInspectorName(survey.inspectorName);
        setDateTime(survey.dateTime?.slice(0, 16) || new Date().toISOString().slice(0, 16));
        setGps(survey.gpsCoordinates);
        setChecklist(survey.checklist.length
          ? survey.checklist
          : DEFAULT_CHECKLIST_ITEMS.map((i) => ({ ...i, id: generateId() })));
        setNotes(survey.notes || '');
        setSlotMap(buildInitialSlotMap(survey.photos || []));
        const matched = PROJECT_TYPE_OPTIONS.find((o) => survey.title?.includes(o.value));
        if (matched) setProjectType(matched.value);
      } catch {
        setError('Failed to load survey. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [surveyId]);

  // ── GPS ──
  const handleGetGps = useCallback(() => {
    if (!navigator.geolocation) { setError('Geolocation not supported.'); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsLoading(false);
      },
      () => { setError('Could not get location.'); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // ── Photo handlers ──
  const handlePhotoCapture = useCallback(async (file: File, slotKey: string) => {
    try {
      const photo = await fileToPhoto(file);
      photo.name = `${slotKey}_${photo.name}`;
      setSlotMap((prev) => ({ ...prev, [slotKey]: photo }));
    } catch { setError('Failed to process photo.'); }
  }, []);

  const handlePhotoRemove = useCallback((slotKey: string) => {
    setSlotMap((prev) => ({ ...prev, [slotKey]: null }));
  }, []);

  // ── Flat photos ──
  const flatPhotos = (): Photo[] => Object.values(slotMap).filter(Boolean) as Photo[];

  // ── Build payload ──
  const buildPayload = (status: Survey['status']) => ({
    id: savedIdRef.current || generateId(),
    title: title || `${projectType || 'Survey'} – ${siteName || 'Unnamed Site'}`,
    siteName, siteAddress, inspectorName, dateTime,
    gpsCoordinates: gps,
    checklist, notes,
    photos: flatPhotos(),
    status,
  });

  // ── Auto-save ──
  const autoSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const payload = buildPayload('draft');
      let survey: Survey;
      if (savedIdRef.current) {
        survey = await updateSurvey(savedIdRef.current, payload);
      } else {
        survey = await createSurvey(payload);
        savedIdRef.current = survey.id;
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
      return survey;
    } catch {
      setSaveStatus('error');
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteName, siteAddress, inspectorName, dateTime, gps, checklist, notes, slotMap, title, projectType]);

  // ── Navigation with animation ──
  const goNext = async () => {
    setError(null);
    if (step < STEPS.length) {
      await autoSave();
      setStep((s) => s + 1);
      setAnimKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    setError(null);
    if (step > 1) {
      setStep((s) => s - 1);
      setAnimKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Jump to a specific step from Review (edit button)
  const jumpToStep = (n: number) => {
    setError(null);
    setStep(n);
    setAnimKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Submit ──
  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    setSaveStatus('saving');
    try {
      const payload = buildPayload('submitted');
      let survey: Survey;
      if (savedIdRef.current) {
        survey = await updateSurvey(savedIdRef.current, payload);
      } else {
        survey = await createSurvey(payload);
      }
      setSaveStatus('saved');
      setSubmittedSurvey(survey);
      setSubmitted(true);
    } catch {
      setError('Submission failed. Please check your connection and try again.');
      setSaveStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived: checklist summary ──
  const summary = (() => {
    const c = { pass: 0, fail: 0, 'n/a': 0, pending: 0 };
    checklist.forEach((item) => c[item.status]++);
    return c;
  })();

  const total = checklist.length;
  const failedItems    = checklist.filter((c) => c.status === 'fail');
  const missingRequired = PHOTO_SLOTS.filter((s) => s.required && !slotMap[s.key]);
  const hasIssues      = failedItems.length > 0 || missingRequired.length > 0;

  const saveBadgeLabel = () => {
    if (saveStatus === 'saving') return 'Saving…';
    if (saveStatus === 'saved')  return 'Saved ✓';
    if (saveStatus === 'error')  return 'Save failed';
    return 'Draft';
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="sv2-loading">
        <div className="sv2-spinner" />
        <span>Loading survey…</span>
      </div>
    );
  }

  // ── SUCCESS SCREEN ──
  if (submitted && submittedSurvey) {
    return (
      <div className="sv2-success-screen">
        <div className="sv2-success-icon-ring">✅</div>
        <h2 className="sv2-success-title">Survey Submitted</h2>
        <p className="sv2-success-sub">
          {submittedSurvey.title || 'Your survey'} has been submitted successfully.
        </p>
        <div className="sv2-success-id-card">
          <span className="sv2-success-id-label">Survey ID</span>
          <span className="sv2-success-id-value">{submittedSurvey.id}</span>
        </div>
        <div className="sv2-success-next">
          <span className="sv2-success-next-icon">📡</span>
          <span>Data is now available for project processing and engineering review.</span>
        </div>
        <button
          type="button"
          className="sv2-success-done-btn"
          onClick={() => onSaved(submittedSurvey)}
        >
          Back to Surveys
        </button>
      </div>
    );
  }

  return (
    <div className="sv2-shell">

      {/* ── Sticky Header ── */}
      <header className="sv2-header">
        <div className="sv2-header-inner">
          <span className="sv2-header-title">
            {title || projectType || 'New Survey'}
          </span>
          <span className={`sv2-save-badge${saveStatus !== 'idle' ? ` sv2-save-badge--${saveStatus}` : ''}`}>
            <span className="sv2-save-dot" />
            {saveBadgeLabel()}
          </span>
        </div>
      </header>

      {/* ── Progress Pills ── */}
      <div className="sv2-progress-bar">
        <div className="sv2-progress-pills">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={[
                'sv2-pill',
                s.id === step ? 'sv2-pill--active' : '',
                s.id < step  ? 'sv2-pill--done'   : '',
              ].filter(Boolean).join(' ')}
            />
          ))}
        </div>
      </div>

      {/* ── Step Label ── */}
      <div className="sv2-step-label">
        <span className="sv2-step-num">Step {step} of {STEPS.length}</span>
        <span className="sv2-step-divider" />
        <span className="sv2-step-name">{STEPS[step - 1].label}</span>
      </div>

      {/* ── Body ── */}
      <main className="sv2-body">
        {error && (
          <div style={{ maxWidth: 640, margin: '0 auto 12px' }}>
            <div className="sv2-error-bar">⚠️ {error}</div>
          </div>
        )}

        {/* ════════════ STEP 1 – SITE INFO ════════════ */}
        {step === 1 && (
          <div key={`step-${animKey}`} className="sv2-step-pane sv2-step-pane--enter">
            <div className="sv2-step-header">
              <h2 className="sv2-step-hero-title">Site Information</h2>
              <p className="sv2-step-hero-sub">Tell us about this job site and who's on it.</p>
            </div>

            {/* Project Type */}
            <div className="sv2-card">
              <div className="sv2-card-header">
                <div>
                  <p className="sv2-card-title">Project Type</p>
                  <p className="sv2-card-sub">What type of installation is this?</p>
                </div>
              </div>
              <div className="sv2-card-body">
                <ChipGroup
                  options={PROJECT_TYPE_OPTIONS}
                  value={projectType}
                  onChange={(v) => {
                    setProjectType(v);
                    if (!title) setTitle(`${v} – ${siteName || 'New Site'}`);
                  }}
                  cols={2}
                />
              </div>
            </div>

            {/* Site Details */}
            <div className="sv2-card">
              <div className="sv2-card-header">
                <div>
                  <p className="sv2-card-title">Site Details</p>
                  <p className="sv2-card-sub">Location information for this survey.</p>
                </div>
              </div>
              <div className="sv2-card-body">
                <div className="sv2-field">
                  <label className="sv2-label">
                    Survey Title
                    <span className="sv2-label-hint">(auto-filled if blank)</span>
                  </label>
                  <input
                    type="text"
                    className="sv2-input"
                    placeholder="e.g. Solar Install – 123 Main St"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="sv2-field">
                  <label className="sv2-label">
                    Site Name <span className="sv2-label-required">*</span>
                  </label>
                  <input
                    type="text"
                    className="sv2-input"
                    placeholder="e.g. Smith Residence"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                  />
                </div>
                <div className="sv2-field">
                  <label className="sv2-label">Site Address</label>
                  <input
                    type="text"
                    className="sv2-input"
                    placeholder="Street address or suburb"
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                  />
                </div>
                <div className="sv2-field">
                  <label className="sv2-label">GPS Coordinates</label>
                  <div className="sv2-gps-row">
                    <div className={`sv2-gps-display${gps ? ' sv2-gps-display--got' : ''}`}>
                      {gps
                        ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)} ±${Math.round(gps.accuracy || 0)}m`
                        : 'Not captured'}
                    </div>
                    <button
                      type="button"
                      className="sv2-gps-btn"
                      onClick={handleGetGps}
                      disabled={gpsLoading}
                    >
                      {gpsLoading ? '…' : gps ? '🔄 Update' : '📍 Get GPS'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Inspector */}
            <div className="sv2-card">
              <div className="sv2-card-header">
                <div>
                  <p className="sv2-card-title">Inspector Details</p>
                </div>
              </div>
              <div className="sv2-card-body">
                <div className="sv2-field">
                  <label className="sv2-label">
                    Inspector Name <span className="sv2-label-required">*</span>
                  </label>
                  <input
                    type="text"
                    className="sv2-input"
                    placeholder="Your full name"
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                  />
                </div>
                <div className="sv2-field">
                  <label className="sv2-label">Date & Time</label>
                  <input
                    type="datetime-local"
                    className="sv2-input"
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ STEP 2 – CHECKLIST ════════════ */}
        {step === 2 && (
          <div key={`step-${animKey}`} className="sv2-step-pane sv2-step-pane--enter">
            <div className="sv2-step-header">
              <h2 className="sv2-step-hero-title">Site Checklist</h2>
              <p className="sv2-step-hero-sub">Tap a card to cycle status, or use the chips.</p>
            </div>

            {/* Segmented summary bar */}
            <div className="sv2-checklist-summary">
              <div className="sv2-checklist-bar">
                {total > 0 && summary.pass > 0    && <div className="sv2-bar-seg sv2-bar-seg--pass"    style={{ flex: summary.pass }}    />}
                {total > 0 && summary.fail > 0    && <div className="sv2-bar-seg sv2-bar-seg--fail"    style={{ flex: summary.fail }}    />}
                {total > 0 && summary['n/a'] > 0  && <div className="sv2-bar-seg sv2-bar-seg--na"      style={{ flex: summary['n/a'] }}  />}
                {total > 0 && summary.pending > 0 && <div className="sv2-bar-seg sv2-bar-seg--pending" style={{ flex: summary.pending }} />}
              </div>
              <div className="sv2-summary-pills">
                <span className="sv2-summary-pill sv2-summary-pill--pass">✓ {summary.pass} Pass</span>
                <span className="sv2-summary-pill sv2-summary-pill--fail">✕ {summary.fail} Fail</span>
                <span className="sv2-summary-pill sv2-summary-pill--na">— {summary['n/a']} N/A</span>
                <span className="sv2-summary-pill sv2-summary-pill--pending">⏳ {summary.pending} Pending</span>
              </div>
            </div>

            <div className="sv2-checklist">
              {checklist.map((item) => (
                <CheckCard
                  key={item.id}
                  item={item}
                  onChange={(updated) =>
                    setChecklist((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
                  }
                />
              ))}
            </div>

            {/* General notes */}
            <div className="sv2-card">
              <div className="sv2-card-header">
                <div>
                  <p className="sv2-card-title">General Notes</p>
                  <p className="sv2-card-sub">Additional observations or site conditions.</p>
                </div>
              </div>
              <div className="sv2-card-body">
                <div className="sv2-field">
                  <textarea
                    className="sv2-textarea"
                    rows={4}
                    placeholder="Describe any additional site conditions, access issues, safety concerns…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ STEP 3 – PHOTOS ════════════ */}
        {step === 3 && (
          <div key={`step-${animKey}`} className="sv2-step-pane sv2-step-pane--enter">
            <div className="sv2-step-header">
              <h2 className="sv2-step-hero-title">Site Photos</h2>
              <p className="sv2-step-hero-sub">
                Tap a slot to capture a photo. Required slots pulse amber.
              </p>
            </div>

            <div className="sv2-card">
              <div className="sv2-card-header">
                <div>
                  <p className="sv2-card-title">Photo Documentation</p>
                  <p className="sv2-card-sub">
                    {Object.values(slotMap).filter(Boolean).length} of {PHOTO_SLOTS.length} slots filled
                    {' · '}
                    {missingRequired.length > 0
                      ? `${missingRequired.length} required remaining`
                      : '✓ All required'}
                  </p>
                </div>
              </div>
              <div className="sv2-card-body">
                <div className="sv2-photo-grid">
                  {PHOTO_SLOTS.map((slot) => (
                    <PhotoSlot
                      key={slot.key}
                      slot={slot}
                      photo={slotMap[slot.key]}
                      onCapture={handlePhotoCapture}
                      onRemove={handlePhotoRemove}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="sv2-card">
              <div className="sv2-card-header">
                <p className="sv2-card-title">📸 Photo Tips</p>
              </div>
              <div className="sv2-card-body">
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
                  • Ensure good lighting — avoid shooting into the sun<br />
                  • Capture full equipment labels where visible<br />
                  • Wide shot first, then close-up for key items<br />
                  • Safety hazards must be clearly photographed
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ STEP 4 – REVIEW ════════════ */}
        {step === 4 && (
          <div key={`step-${animKey}`} className="sv2-step-pane sv2-step-pane--enter">
            <div className="sv2-step-header">
              <h2 className="sv2-step-hero-title">Review & Submit</h2>
              <p className="sv2-step-hero-sub">Everything look right? Tap Edit to jump back.</p>
            </div>

            {/* Confidence banner */}
            <div className={`sv2-confidence-banner ${hasIssues ? 'sv2-confidence-banner--issues' : 'sv2-confidence-banner--ready'}`}>
              <span className="sv2-confidence-icon">{hasIssues ? '⚠️' : '✅'}</span>
              <div className="sv2-confidence-text">
                <strong>{hasIssues ? `${failedItems.length + missingRequired.length} issue${failedItems.length + missingRequired.length > 1 ? 's' : ''} need attention` : 'Survey ready for submission'}</strong>
                <span>
                  {hasIssues
                    ? [failedItems.length > 0 && `${failedItems.length} checklist item${failedItems.length > 1 ? 's' : ''} failed`, missingRequired.length > 0 && `${missingRequired.length} required photo${missingRequired.length > 1 ? 's' : ''} missing`].filter(Boolean).join(' · ')
                    : 'All checklist items assessed and required photos captured.'}
                </span>
              </div>
            </div>

            {/* Site info */}
            <div className="sv2-card">
              <div className="sv2-card-header">
                <div>
                  <p className="sv2-card-title">Site Information</p>
                </div>
                <button type="button" className="sv2-card-edit-btn" onClick={() => jumpToStep(1)}>
                  Edit
                </button>
              </div>
              <div className="sv2-card-body">
                <div className="sv2-review-section">
                  {[
                    { key: 'Project',    val: projectType || null },
                    { key: 'Title',      val: title || `${projectType || 'Survey'} – ${siteName || 'Unnamed Site'}` },
                    { key: 'Site Name',  val: siteName || null },
                    { key: 'Address',    val: siteAddress || null },
                    { key: 'Inspector',  val: inspectorName || null },
                    { key: 'Date / Time', val: new Date(dateTime).toLocaleString() },
                    { key: 'GPS',        val: gps ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` : null },
                  ].map(({ key, val }) => (
                    <div key={key} className="sv2-review-row">
                      <span className="sv2-review-key">{key}</span>
                      <span className={`sv2-review-val${!val ? ' sv2-review-val--empty' : ''}`}>
                        {val || 'Not entered'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div className="sv2-card">
              <div className="sv2-card-header">
                <div>
                  <p className="sv2-card-title">Checklist</p>
                  <p className="sv2-card-sub">{summary.pass} pass · {summary.fail} fail · {summary['n/a']} n/a · {summary.pending} pending</p>
                </div>
                <button type="button" className="sv2-card-edit-btn" onClick={() => jumpToStep(2)}>
                  Edit
                </button>
              </div>
              <div className="sv2-card-body">
                <div className="sv2-review-status-list">
                  {checklist.map((item) => {
                    const css = item.status === 'n/a' ? 'na' : item.status;
                    return (
                      <div
                        key={item.id}
                        className={`sv2-review-check-row${item.status === 'fail' ? ' sv2-review-check-row--fail' : ''}`}
                      >
                        <div className={`sv2-review-check-dot sv2-review-check-dot--${css}`} />
                        <span className="sv2-review-check-name">{item.label}</span>
                        <span className={`sv2-review-check-status sv2-review-check-status--${css}`}>
                          {item.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {notes.trim() && (
                  <div className="sv2-review-row" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    <span className="sv2-review-key">Notes</span>
                    <span className="sv2-review-val" style={{ whiteSpace: 'pre-wrap' }}>{notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Photos */}
            <div className="sv2-card">
              <div className="sv2-card-header">
                <div>
                  <p className="sv2-card-title">Photos</p>
                  <p className="sv2-card-sub">{flatPhotos().length} photo{flatPhotos().length !== 1 ? 's' : ''} captured</p>
                </div>
                <button type="button" className="sv2-card-edit-btn" onClick={() => jumpToStep(3)}>
                  Edit
                </button>
              </div>
              {flatPhotos().length > 0 && (
                <div className="sv2-card-body">
                  <div className="sv2-review-photos">
                    {flatPhotos().map((p) => (
                      <img key={p.id} src={p.dataUrl} alt={p.name} className="sv2-review-thumb" />
                    ))}
                  </div>
                </div>
              )}
              {/* Missing required photos warning */}
              {missingRequired.length > 0 && (
                <div style={{ padding: '0 16px 14px' }}>
                  <div className="sv2-missing-photos-card">
                    <span className="sv2-missing-photos-icon">📷</span>
                    <div className="sv2-missing-photos-body">
                      <p className="sv2-missing-photos-title">Required photos missing</p>
                      <p className="sv2-missing-photos-list">
                        {missingRequired.map((s) => s.label).join(' · ')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit banner */}
            <div className="sv2-submit-banner">
              <h3>{hasIssues ? '⚠️ Submit with issues?' : '🚀 Ready to submit!'}</h3>
              <p>
                {hasIssues
                  ? 'You can submit now — issues will be flagged for review.'
                  : 'Once submitted this survey is locked and queued for processing.'}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* ── Fixed Bottom Nav ── */}
      <nav className="sv2-bottom-nav">
        <div className="sv2-bottom-nav-inner">
          {/* Left: Back / Cancel */}
          {step > 1 ? (
            <button type="button" className="sv2-btn-back" onClick={goBack}>
              ← Back
            </button>
          ) : (
            <button type="button" className="sv2-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}

          {/* Middle: Save Draft */}
          <button
            type="button"
            className="sv2-btn-save"
            disabled={submitting || saveStatus === 'saving'}
            onClick={async () => {
              const saved = await autoSave();
              if (saved) onSaved(saved);
            }}
          >
            Save Draft
          </button>

          {/* Right: Next / Submit */}
          {step < STEPS.length ? (
            <button
              type="button"
              className="sv2-btn-next"
              onClick={goNext}
              disabled={saveStatus === 'saving'}
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              className="sv2-btn-submit"
              onClick={handleSubmit}
              disabled={submitting || saveStatus === 'saving'}
            >
              {submitting
                ? <><span className="sv2-spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)', display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />Submitting…</>
                : '✅ Submit Survey'}
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}