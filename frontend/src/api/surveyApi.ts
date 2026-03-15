import type { Survey } from '../types/survey';
import { apiFetch } from './apiClient';

function handleApiError(res: Response, fallback: string): never {
  if (res.status === 401) {
    throw new Error('Session expired. Please sign in again.');
  }

  throw new Error(fallback);
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
  const res = await apiFetch('/surveys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(survey),
  });
  if (!res.ok) handleApiError(res, `Failed to create survey: ${res.statusText}`);
  return res.json() as Promise<Survey>;
}

export async function updateSurvey(id: string, survey: Partial<Survey>): Promise<Survey> {
  const res = await apiFetch(`/surveys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(survey),
  });
  if (!res.ok) handleApiError(res, `Failed to update survey: ${res.statusText}`);
  return res.json() as Promise<Survey>;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await apiFetch('/health', {}, { includeAuth: false, notifyOnUnauthorized: false });
    return res.ok;
  } catch {
    return false;
  }
}
