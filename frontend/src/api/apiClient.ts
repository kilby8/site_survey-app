import { notifyUnauthorized } from './authEvents';

const API_BASE = '/api';

interface ApiFetchOptions {
  includeAuth?: boolean;
  notifyOnUnauthorized?: boolean;
  token?: string;
}

function withAuth(headers: HeadersInit | undefined, token?: string): Headers {
  const nextHeaders = new Headers(headers);
  const resolvedToken = token || localStorage.getItem('auth_token');
  if (resolvedToken) {
    nextHeaders.set('Authorization', `Bearer ${resolvedToken}`);
  }
  return nextHeaders;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: ApiFetchOptions = {}
): Promise<Response> {
  const {
    includeAuth = true,
    notifyOnUnauthorized = true,
    token,
  } = options;

  const headers = includeAuth ? withAuth(init.headers, token) : init.headers;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 401 && notifyOnUnauthorized) {
    notifyUnauthorized();
  }

  return res;
}
