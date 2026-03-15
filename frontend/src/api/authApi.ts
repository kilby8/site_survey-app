import { apiFetch } from './apiClient';

export interface AuthUser {
  id: string;
  username?: string;
  email: string;
  fullName: string;
  role?: 'user' | 'admin';
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ForgotPasswordResponse {
  message: string;
  resetToken?: string;
  expiresInMinutes?: number;
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

export function signIn(identifier: string, password: string): Promise<AuthResponse> {
  return postAuth('signin', { identifier, password });
}

export function registerUser(email: string, password: string, fullName: string): Promise<AuthResponse> {
  return postAuth('register', { email, password, full_name: fullName });
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  const res = await apiFetch('/users/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }, { includeAuth: false, notifyOnUnauthorized: false });

  const data = await res.json().catch(() => ({} as ForgotPasswordResponse & { error?: string }));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Could not create password reset token');
  }

  return data;
}

export async function resetPassword(email: string, token: string, newPassword: string): Promise<{ message: string }> {
  const res = await apiFetch('/users/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token, new_password: newPassword }),
  }, { includeAuth: false, notifyOnUnauthorized: false });

  const data = await res.json().catch(() => ({} as { message?: string; error?: string }));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Could not reset password');
  }

  return { message: data.message || 'Password reset successful.' };
}

export async function requestSocialSignIn(provider: 'google' | 'microsoft' | 'apple'): Promise<void> {
  const res = await apiFetch(`/users/oauth/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { includeAuth: false, notifyOnUnauthorized: false });

  const data = await res.json().catch(() => ({} as { error?: string }));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `${provider} sign-in is not available`);
  }
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
