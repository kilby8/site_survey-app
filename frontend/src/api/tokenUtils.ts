interface JwtPayload {
  exp?: number;
}

function decodeBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return atob(padded);
  } catch {
    return null;
  }
}

export function getTokenExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;

  const payloadJson = decodeBase64Url(parts[1]);
  if (!payloadJson) return null;

  try {
    const payload = JSON.parse(payloadJson) as JwtPayload;
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}
