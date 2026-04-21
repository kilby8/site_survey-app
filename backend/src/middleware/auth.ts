import { NextFunction, Request, Response } from 'express';
import { verifyAuthToken, AuthTokenPayload } from '../utils/authToken';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Primary: Authorization: Bearer <token> header
  // Fallback: ?token= query param (used by SSE clients that can't set headers)
  const authHeader = req.header('Authorization') || '';
  const rawToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : typeof req.query.token === 'string'
      ? req.query.token.trim()
      : '';

  if (!rawToken) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const payload = verifyAuthToken(rawToken);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.authUser = payload;
  next();
}
