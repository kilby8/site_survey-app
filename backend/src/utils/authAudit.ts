import { createHash } from 'crypto';
import { Request } from 'express';

interface AuthAuditMeta {
  status?: number;
  reason?: string;
  userId?: string;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function redactEmail(email?: string): string {
  if (!email) return 'unknown';
  const trimmed = email.trim().toLowerCase();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return `hash:${hash(trimmed)}`;
  return `hash:${hash(trimmed)}@${parts[1]}`;
}

function redactIp(ip?: string): string {
  if (!ip) return 'unknown';
  if (ip.includes(':')) {
    const segments = ip.split(':');
    return `${segments.slice(0, 3).join(':')}:*`;
  }

  const segments = ip.split('.');
  if (segments.length !== 4) return 'unknown';
  return `${segments[0]}.${segments[1]}.*.*`;
}

export function authAudit(event: string, req: Request, email?: string, meta: AuthAuditMeta = {}): void {
  const payload = {
    event,
    when: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: redactIp(req.ip || req.socket.remoteAddress || undefined),
    email: redactEmail(email),
    status: meta.status,
    reason: meta.reason,
    userId: meta.userId,
  };

  console.info('[auth-audit]', JSON.stringify(payload));
}
