import { Request, Response, NextFunction, RequestHandler } from 'express';

interface RateLimitState {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  keyFn?: (req: Request) => string;
  message?: string;
}

const stateMap = new Map<string, RateLimitState>();

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const {
    maxRequests,
    windowMs,
    keyFn,
    message = 'Too many requests. Please try again later.',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn ? keyFn(req) : `${req.method}:${req.path}:${clientIp(req)}`;
    const now = Date.now();
    const current = stateMap.get(key);

    if (!current || current.resetAt <= now) {
      stateMap.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
