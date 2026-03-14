import type { Survey } from '../types/survey';

const API_BASE = '/api';

export async function fetchSurveys(): Promise<Survey[]> {
  const res = await fetch(`${API_BASE}/surveys`);
  if (!res.ok) throw new Error(`Failed to fetch surveys: ${res.statusText}`);
  const data = await res.json();
  return data.surveys as Survey[];
}

export async function fetchSurvey(id: string): Promise<Survey> {
  const res = await fetch(`${API_BASE}/surveys/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch survey: ${res.statusText}`);
  return res.json() as Promise<Survey>;
}

export async function createSurvey(survey: Omit<Survey, 'createdAt' | 'updatedAt'>): Promise<Survey> {
  const res = await fetch(`${API_BASE}/surveys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(survey),
  });
  if (!res.ok) throw new Error(`Failed to create survey: ${res.statusText}`);
  return res.json() as Promise<Survey>;
}

export async function updateSurvey(id: string, survey: Partial<Survey>): Promise<Survey> {
  const res = await fetch(`${API_BASE}/surveys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(survey),
  });
  if (!res.ok) throw new Error(`Failed to update survey: ${res.statusText}`);
  return res.json() as Promise<Survey>;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
