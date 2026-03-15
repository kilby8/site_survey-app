import nodemailer from 'nodemailer';

function boolFromEnv(raw: string | undefined, fallback: boolean): boolean {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

interface MailConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  sender: string;
  useTls: boolean;
  appBaseUrl: string;
}

function loadMailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || undefined;
  const password = process.env.SMTP_PASSWORD || undefined;
  const sender = process.env.SMTP_SENDER || 'noreply@solardb.local';
  const useTls = boolFromEnv(process.env.SMTP_USE_TLS, true);
  const appBaseUrl = process.env.PASSWORD_RESET_APP_BASE_URL || 'http://localhost:5173';

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    user,
    password,
    sender,
    useTls,
    appBaseUrl,
  };
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const config = loadMailConfig();
  if (!config) {
    throw new Error('SMTP_HOST is not configured');
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false,
    requireTLS: config.useTls,
    auth: config.user && config.password
      ? { user: config.user, pass: config.password }
      : undefined,
  });

  await transporter.verify();

  const resetLink = `${config.appBaseUrl.replace(/\/$/, '')}/?reset=1&email=${encodeURIComponent(to)}&token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from: config.sender,
    to,
    subject: 'Site Survey Password Reset',
    text: [
      'A password reset was requested for your Site Survey account.',
      '',
      `Reset link: ${resetLink}`,
      `Token: ${token}`,
      '',
      'If you did not request this, you can ignore this message.',
    ].join('\n'),
    html: [
      '<p>A password reset was requested for your <strong>Site Survey</strong> account.</p>',
      `<p><a href="${resetLink}">Open reset page</a></p>`,
      `<p>Reset token: <code>${token}</code></p>`,
      '<p>If you did not request this, you can ignore this message.</p>',
    ].join(''),
  });
}
