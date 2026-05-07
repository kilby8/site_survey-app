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

  // Static partner API key bypass — allows server-to-server calls from SolarPro
  // without a short-lived JWT. Set PARTNER_API_KEY on the Render backend.
  // Also accepts SOLARPRO_API_KEY as an alias (used in some deploy configs).
  // The token must be a long random string (min 32 chars) — never a user JWT.
  const partnerApiKey = process.env.PARTNER_API_KEY || process.env.SOLARPRO_API_KEY;
  if (partnerApiKey && partnerApiKey.length >= 32 && rawToken === partnerApiKey) {
    req.authUser = {
      userId: 'partner-service-account',
      email: 'partner@solarpro.internal',
      role: 'user',
    };
    next();
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
