import { FormEvent, useMemo, useState } from 'react';
import { registerUser, signIn } from '../api/authApi';
import type { AuthUser } from '../api/authApi';

interface AuthScreenProps {
  onAuthenticated: (token: string, user: AuthUser) => void;
  initialMessage?: string | null;
}

function AuthScreen({ onAuthenticated, initialMessage = null }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialMessage);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (mode === 'signin' ? 'Welcome Back' : 'Create Account'), [mode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    if (mode === 'register' && !fullName.trim()) {
      setError('Full name is required for registration.');
      return;
    }

    setLoading(true);
    try {
      const response = mode === 'signin'
        ? await signIn(email.trim(), password)
        : await registerUser(email.trim(), password, fullName.trim());
      onAuthenticated(response.token, response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">Sign in to continue managing site survey records.</p>

        {notice && <div className="alert alert--warning">{notice}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="auth-label">
              Full name
              <input
                className="auth-input"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Jane Site Inspector"
                autoComplete="name"
              />
            </label>
          )}

          <label className="auth-label">
            Email
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="auth-label">
            Password
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>

          <button type="submit" className="btn btn--primary auth-submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn--ghost auth-toggle"
          onClick={() => {
            setError(null);
            setNotice(null);
            setMode((prev) => (prev === 'signin' ? 'register' : 'signin'));
          }}
        >
          {mode === 'signin' ? 'Need an account? Register' : 'Already have an account? Sign in'}
        </button>
      </section>
    </div>
  );
}

export default AuthScreen;
