import type { Survey, FallbackProjectTemplate, Photo } from '../types/survey';
import { apiFetch } from './apiClient';

function handleApiError(res: Response, fallback: string): never {
  if (res.status === 401) {
    throw new Error('Session expired. Please sign in again.');
  }

  throw new Error(fallback);
}

/**
 * Transform the camelCase Survey object (used internally by the mobile frontend)
 * into the snake_case payload shape expected by the backend API.
 *
 * Mobile Survey type:
 *   { id, title, siteName, siteAddress, inspectorName, dateTime,
 *     gpsCoordinates: { latitude, longitude, accuracy },
 *     photos: [{ id, name, dataUrl, capturedAt }], checklist, notes, status }
 *
 * Backend API expects:
 *   { id, project_name, site_name, site_address, inspector_name, survey_date,
 *     latitude, longitude, gps_accuracy,
 *     photos: [{ filename, label, data_url, mime_type, captured_at }],
 *     checklist, notes, status }
 */
function toApiPayload(survey: Partial<Survey> & { id?: string }): Record<string, unknown> {
  const photos = (survey.photos ?? []).map((p: Photo) => ({
    filename:    p.name,
    label:       p.name,
    data_url:    p.dataUrl,
    mime_type:   'image/jpeg',
    captured_at: p.capturedAt,
  }));

  return {
    id:             survey.id,
    project_name:   survey.title ?? survey.siteName ?? 'Site Survey',
    site_name:      survey.siteName   ?? '',
    site_address:   survey.siteAddress ?? null,
    inspector_name: survey.inspectorName ?? '',
    survey_date:    survey.dateTime ?? new Date().toISOString(),
    latitude:       survey.gpsCoordinates?.latitude  ?? null,
    longitude:      survey.gpsCoordinates?.longitude ?? null,
    gps_accuracy:   survey.gpsCoordinates?.accuracy  ?? null,
    notes:          survey.notes ?? null,
    status:         survey.status ?? 'draft',
    checklist:      (survey.checklist ?? []).map(c => ({
      label:    c.label,
      status:   c.status,
      notes:    c.notes,
    })),
    photos,
  };
}

export async function fetchSurveys(): Promise<Survey[]> {
  const res = await apiFetch('/surveys');
  if (!res.ok) handleApiError(res, `Failed to fetch surveys: ${res.statusText}`);
  const data = await res.json();
  return data.surveys as Survey[];
}

export async function fetchSurvey(id: string): Promise<Survey> {
  const res = await apiFetch(`/surveys/${id}`);
  if (!res.ok) handleApiError(res, `Failed to fetch survey: ${res.statusText}`);
  return res.json() as Promise<Survey>;
}

export async function createSurvey(survey: Omit<Survey, 'createdAt' | 'updatedAt'>): Promise<Survey> {
  const payload = toApiPayload(survey);
  const res = await apiFetch('/surveys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) handleApiError(res, `Failed to create survey: ${res.statusText}`);
  return res.json() as Promise<Survey>;
}

export async function updateSurvey(id: string, survey: Partial<Survey>): Promise<Survey> {
  const payload = toApiPayload({ ...survey, id });
  const res = await apiFetch(`/surveys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) handleApiError(res, `Failed to update survey: ${res.statusText}`);
  return res.json() as Promise<Survey>;
}

export async function fetchFallbackProjectTemplates(): Promise<FallbackProjectTemplate[]> {
  const res = await apiFetch('/fallback-surveys/projects');
  if (!res.ok) handleApiError(res, `Failed to fetch project templates: ${res.statusText}`);
  const data = await res.json();
  return (data.projects ?? []) as FallbackProjectTemplate[];
}

/**
 * POST /api/surveys/:id/complete
 *
 * Marks a survey as completed and fires the webhook to SolarPro.
 * Must be called AFTER the survey has been saved with status='submitted'.
 * The backend deduplicates — calling it twice is safe.
 */
export async function completeSurvey(id: string): Promise<{ survey_id: string; status: string; event_id: string }> {
  const res = await apiFetch(`/surveys/${id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) handleApiError(res, `Failed to complete survey: ${res.statusText}`);
  return res.json() as Promise<{ survey_id: string; status: string; event_id: string }>;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await apiFetch('/health', {}, { includeAuth: false, notifyOnUnauthorized: false });
    return res.ok;
  } catch {
    return false;
  }
}