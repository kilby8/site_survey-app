import { apiFetch } from './apiClient';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

async function postAuth(path: string, payload: Record<string, string>): Promise<AuthResponse> {
  const res = await apiFetch(`/users/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, { includeAuth: false, notifyOnUnauthorized: false });

  const data = await res.json().catch(() => ({} as Record<string, string>));

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Authentication failed');
  }

  return data as AuthResponse;
}

export function signIn(email: string, password: string): Promise<AuthResponse> {
  return postAuth('signin', { email, password });
}

export function registerUser(email: string, password: string, fullName: string): Promise<AuthResponse> {
  return postAuth('register', { email, password, full_name: fullName });
}

export async function getCurrentUser(token?: string): Promise<AuthUser> {
  const res = await apiFetch('/users/me', {}, { token });

  const data = await res.json().catch(() => ({} as { error?: string; user?: AuthUser }));

  if (res.status === 401) {
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok || !data.user) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Could not load current user');
  }

  return data.user;
}
