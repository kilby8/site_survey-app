import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

function getSecret(): string {
  return process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
}

function getExpiresIn(): jwt.SignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN || '12h') as jwt.SignOptions['expiresIn'];
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: getExpiresIn() });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (!decoded || typeof decoded !== 'object') return null;

    const maybePayload = decoded as Partial<AuthTokenPayload>;
    if (typeof maybePayload.userId !== 'string' || typeof maybePayload.email !== 'string') {
      return null;
    }

    return { userId: maybePayload.userId, email: maybePayload.email };
  } catch {
    return null;
  }
}
