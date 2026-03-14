import React, { useEffect, useState } from 'react';
import type { Survey } from '../types/survey';
import { fetchSurveys } from '../api/surveyApi';

interface SurveyListProps {
  onNewSurvey: () => void;
  onEditSurvey: (id: string) => void;
  refreshTrigger?: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getChecklistSummary(survey: Survey): string {
  const total = survey.checklist.length;
  if (total === 0) return 'No checklist items';
  const passed = survey.checklist.filter(i => i.status === 'pass').length;
  const failed = survey.checklist.filter(i => i.status === 'fail').length;
  return `${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}`;
}

const SurveyList: React.FC<SurveyListProps> = ({ onNewSurvey, onEditSurvey, refreshTrigger }) => {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSurveys()
      .then(data => {
        if (!cancelled) setSurveys(data);
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message || 'Failed to load surveys');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  return (
    <div className="survey-list">
      <div className="survey-list-toolbar">
        <p className="survey-count">
          {loading ? 'Loading...' : `${surveys.length} survey${surveys.length !== 1 ? 's' : ''}`}
        </p>
        <button className="btn btn--primary" onClick={onNewSurvey}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Survey
        </button>
      </div>

      {error && (
        <div className="alert alert--error">
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading surveys...</p>
        </div>
      )}

      {!loading && surveys.length === 0 && !error && (
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <h3>No surveys yet</h3>
          <p>Tap "New Survey" to get started</p>
        </div>
      )}

      {!loading && surveys.map(survey => (
        <button
          key={survey.id}
          className="survey-card"
          onClick={() => onEditSurvey(survey.id)}
        >
          <div className="survey-card-header">
            <h3 className="survey-card-title">{survey.title || 'Untitled Survey'}</h3>
            <span className={`badge badge--${survey.status}`}>{survey.status}</span>
          </div>
          <div className="survey-card-meta">
            <span className="survey-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {survey.siteName || 'No site name'}
            </span>
            <span className="survey-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {formatDate(survey.dateTime)}
            </span>
          </div>
          <div className="survey-card-footer">
            <span className="survey-inspector">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {survey.inspectorName || 'Unknown inspector'}
            </span>
            <span className="survey-checklist-summary">{getChecklistSummary(survey)}</span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default SurveyList;
