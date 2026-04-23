import React, { useState, useEffect, useCallback } from 'react';
import type { Survey, ChecklistItem, Photo, SurveyStatus, FallbackProjectTemplate } from '../types/survey';
import { DEFAULT_CHECKLIST_ITEMS } from '../types/survey';
import { createSurvey, fetchFallbackProjectTemplates, fetchSurvey, updateSurvey } from '../api/surveyApi';
import { useGeolocation } from '../hooks/useGeolocation';
import { useOfflineSync } from '../hooks/useOfflineSync';
import ChecklistItemComponent from './ChecklistItem';

interface SurveyFormProps {
  surveyId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

function newId(): string {
  return crypto.randomUUID();
}

function createDefaultSurvey(): Omit<Survey, 'createdAt' | 'updatedAt'> {
  return {
    id: newId(),
    title: '',
    siteName: '',
    siteAddress: '',
    inspectorName: '',
    dateTime: new Date().toISOString(),
    gpsCoordinates: null,
    checklist: DEFAULT_CHECKLIST_ITEMS.map(item => ({ ...item, id: newId() })),
    notes: '',
    photos: [],
    status: 'draft',
  };
}

const SurveyForm: React.FC<SurveyFormProps> = ({ surveyId, onSaved, onCancel }) => {
  const [formData, setFormData] = useState<Omit<Survey, 'createdAt' | 'updatedAt'>>(createDefaultSurvey);
  const [loading, setLoading] = useState(!!surveyId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [projectTemplates, setProjectTemplates] = useState<FallbackProjectTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const geo = useGeolocation();
  const { isOnline, enqueue } = useOfflineSync();

  useEffect(() => {
    let cancelled = false;
    fetchFallbackProjectTemplates()
      .then((templates) => {
        if (!cancelled) setProjectTemplates(templates);
      })
      .catch(() => {
        if (!cancelled) setProjectTemplates([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!surveyId) return;
    let cancelled = false;
    fetchSurvey(surveyId)
      .then(survey => {
        if (!cancelled) {
          const { createdAt: _c, updatedAt: _u, ...rest } = survey;
          setFormData(rest);
        }
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [surveyId]);

  useEffect(() => {
    if (geo.coordinates) {
      setFormData(prev => ({ ...prev, gpsCoordinates: geo.coordinates }));
    }
  }, [geo.coordinates]);

  const handleField = useCallback(<K extends keyof typeof formData>(
    key: K,
    value: (typeof formData)[K]
  ) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleChecklistChange = useCallback((updated: ChecklistItem) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.map(item => item.id === updated.id ? updated : item),
    }));
  }, []);

  const handleChecklistRemove = useCallback((id: string) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.filter(item => item.id !== id),
    }));
  }, []);

  const handleAddChecklistItem = useCallback(() => {
    const newItem: ChecklistItem = { id: newId(), label: 'New Item', status: 'pending', notes: '' };
    setFormData(prev => ({ ...prev, checklist: [...prev.checklist, newItem] }));
  }, []);

  const handlePhotoCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const photo: Photo = {
          id: newId(),
          name: file.name,
          dataUrl,
          capturedAt: new Date().toISOString(),
        };
        setFormData(prev => ({ ...prev, photos: [...prev.photos, photo] }));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const handleRemovePhoto = useCallback((id: string) => {
    setFormData(prev => ({ ...prev, photos: prev.photos.filter(p => p.id !== id) }));
  }, []);

  const handleTemplateSelection = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);

    if (!templateId) {
      return;
    }

    const template = projectTemplates.find((p) => p.id === templateId);
    if (!template) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      title: template.project_name || prev.title,
      siteName: template.site_name || prev.siteName,
      siteAddress: template.site_address || prev.siteAddress,
      inspectorName: template.inspector_name || prev.inspectorName,
      notes: template.notes || prev.notes,
      gpsCoordinates:
        typeof template.latitude === 'number' && typeof template.longitude === 'number'
          ? {
              latitude: template.latitude,
              longitude: template.longitude,
              accuracy:
                typeof template.gps_accuracy === 'number'
                  ? template.gps_accuracy
                  : undefined,
            }
          : prev.gpsCoordinates,
    }));
  }, [projectTemplates]);

  const clearTemplateAutofill = useCallback(() => {
    setSelectedTemplateId('');
    setFormData(createDefaultSurvey());
  }, []);

  const handleSave = useCallback(async (status: SurveyStatus) => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    const payload = { ...formData, status };

    try {
      if (isOnline) {
        if (surveyId) {
          await updateSurvey(surveyId, payload);
        } else {
          await createSurvey(payload);
        }
        setSuccessMsg(status === 'submitted' ? 'Survey submitted!' : 'Draft saved!');
        setTimeout(() => onSaved(), 800);
      } else {
        const fullSurvey: Survey = {
          ...payload,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        enqueue(fullSurvey, surveyId ? 'update' : 'create');
        setSuccessMsg('Saved locally. Will sync when online.');
        setTimeout(() => onSaved(), 800);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to save survey');
    } finally {
      setSaving(false);
    }
  }, [formData, isOnline, surveyId, enqueue, onSaved]);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading survey...</p>
      </div>
    );
  }

  return (
    <form className="survey-form" onSubmit={e => e.preventDefault()} noValidate>
      {error && <div className="alert alert--error"><p>{error}</p></div>}
      {successMsg && <div className="alert alert--success"><p>{successMsg}</p></div>}
      {!isOnline && <div className="alert alert--warning"><p>⚠️ You are offline. Changes will sync when you reconnect.</p></div>}

      {/* Basic Info */}
      <section className="form-section">
        <h2 className="section-title">Survey Information</h2>
        <div className="form-group">
          <label htmlFor="projectTemplate">Project Template</label>
          <select
            id="projectTemplate"
            value={selectedTemplateId}
            onChange={e => handleTemplateSelection(e.target.value)}
          >
            <option value="">Select existing project...</option>
            {projectTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.project_name || '(Unnamed Project)'}
              </option>
            ))}
          </select>
          {selectedTemplateId && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ marginTop: 8 }}
              onClick={clearTemplateAutofill}
            >
              Clear template autofill
            </button>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="title">Survey Title *</label>
          <input
            id="title"
            type="text"
            value={formData.title}
            onChange={e => handleField('title', e.target.value)}
            placeholder="e.g. Q1 Network Site Inspection"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="siteName">Site Name *</label>
          <input
            id="siteName"
            type="text"
            value={formData.siteName}
            onChange={e => handleField('siteName', e.target.value)}
            placeholder="e.g. Tower Hill Data Center"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="siteAddress">Site Address</label>
          <input
            id="siteAddress"
            type="text"
            value={formData.siteAddress}
            onChange={e => handleField('siteAddress', e.target.value)}
            placeholder="Full address"
          />
        </div>
        <div className="form-group">
          <label htmlFor="inspectorName">Inspector Name *</label>
          <input
            id="inspectorName"
            type="text"
            value={formData.inspectorName}
            onChange={e => handleField('inspectorName', e.target.value)}
            placeholder="Your full name"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="dateTime">Date &amp; Time</label>
          <input
            id="dateTime"
            type="datetime-local"
            value={formData.dateTime.slice(0, 16)}
            onChange={e => handleField('dateTime', new Date(e.target.value).toISOString())}
          />
        </div>
      </section>

      {/* GPS */}
      <section className="form-section">
        <h2 className="section-title">GPS Location</h2>
        <div className="gps-section">
          {formData.gpsCoordinates ? (
            <div className="gps-display">
              <div className="gps-coords">
                <span>
                  <strong>Lat:</strong> {formData.gpsCoordinates.latitude.toFixed(6)}
                </span>
                <span>
                  <strong>Lng:</strong> {formData.gpsCoordinates.longitude.toFixed(6)}
                </span>
                {formData.gpsCoordinates.accuracy && (
                  <span className="gps-accuracy">±{Math.round(formData.gpsCoordinates.accuracy)}m</span>
                )}
              </div>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={geo.capture}
                disabled={geo.loading}
              >
                Recapture
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={geo.capture}
              disabled={geo.loading}
            >
              {geo.loading ? (
                <><div className="spinner spinner--sm" /> Capturing...</>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Capture Location
                </>
              )}
            </button>
          )}
          {geo.error && <p className="field-error">{geo.error}</p>}
        </div>
      </section>

      {/* Checklist */}
      <section className="form-section">
        <div className="section-header">
          <h2 className="section-title">Checklist</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleAddChecklistItem}>
            + Add Item
          </button>
        </div>
        {formData.checklist.length === 0 ? (
          <p className="empty-hint">No checklist items. Add some above.</p>
        ) : (
          <div className="checklist-list">
            {formData.checklist.map(item => (
              <ChecklistItemComponent
                key={item.id}
                item={item}
                onChange={handleChecklistChange}
                onRemove={handleChecklistRemove}
              />
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="form-section">
        <h2 className="section-title">Notes &amp; Comments</h2>
        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={e => handleField('notes', e.target.value)}
            placeholder="Any additional observations or comments..."
            rows={4}
          />
        </div>
      </section>

      {/* Photos */}
      <section className="form-section">
        <h2 className="section-title">Photos</h2>
        <div className="photo-upload-area">
          <label className="photo-upload-btn" htmlFor="photo-input">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>Add Photos</span>
            <span className="upload-hint">Tap to take photo or choose from gallery</span>
          </label>
          <input
            id="photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="visually-hidden"
            onChange={handlePhotoCapture}
          />
        </div>
        {formData.photos.length > 0 && (
          <div className="photo-grid">
            {formData.photos.map(photo => (
              <div key={photo.id} className="photo-thumb">
                <img src={photo.dataUrl} alt={photo.name} loading="lazy" />
                <button
                  type="button"
                  className="photo-remove"
                  onClick={() => handleRemovePhoto(photo.id)}
                  aria-label={`Remove photo ${photo.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => handleSave('draft')}
          disabled={saving}
        >
          {saving ? <><div className="spinner spinner--sm" /> Saving...</> : 'Save Draft'}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => handleSave('submitted')}
          disabled={saving}
        >
          {saving ? <><div className="spinner spinner--sm" /> Submitting...</> : 'Submit'}
        </button>
      </div>
    </form>
  );
};

export default SurveyForm;
