import { FormEvent, useMemo, useState } from 'react';
import { forgotPassword, registerUser, requestSocialSignIn, resetPassword, signIn } from '../api/authApi';
import type { AuthUser } from '../api/authApi';

interface AuthScreenProps {
  onAuthenticated: (token: string, user: AuthUser) => void;
  initialMessage?: string | null;
}

function AuthScreen({ onAuthenticated, initialMessage = null }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'register' | 'forgot' | 'reset'>('signin');
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'' | 'google' | 'microsoft' | 'apple'>('');
  const [notice, setNotice] = useState<string | null>(initialMessage);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  const isSignIn = mode === 'signin';

  const title = useMemo(() => {
    if (isRegister) return 'Create your account';
    if (isForgot) return 'Recover your password';
    if (isReset) return 'Set a new password';
    return 'Sign in to Site Survey';
  }, [isForgot, isRegister, isReset]);

  const subtitle = useMemo(() => {
    if (isRegister) return 'Create an authenticated workspace for survey capture, syncing, and reporting.';
    if (isForgot) return 'Enter your account email and we will issue reset instructions.';
    if (isReset) return 'Apply your reset token and choose a new account password.';
    return 'Access protected survey records, reports, and field activity from one place.';
  }, [isForgot, isRegister, isReset]);

  const handleSocialSignIn = async (provider: 'google' | 'microsoft' | 'apple') => {
    setError(null);
    setNotice(null);
    setSocialLoading(provider);
    try {
      await requestSocialSignIn(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${provider} sign-in is unavailable.`);
    } finally {
      setSocialLoading('');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    setLoading(true);
    try {
      if (isForgot) {
        if (!resetEmail.trim()) {
          setError('Email is required.');
          return;
        }

        const result = await forgotPassword(resetEmail.trim());
        setNotice(result.resetToken
          ? `${result.message} Dev token: ${result.resetToken}`
          : result.message);
        return;
      }

      if (isReset) {
        if (!resetEmail.trim() || !resetToken.trim() || !nextPassword.trim()) {
          setError('Email, reset token, and a new password are required.');
          return;
        }

        const result = await resetPassword(resetEmail.trim(), resetToken.trim(), nextPassword);
        setNotice(result.message);
        setMode('signin');
        setIdentifier(resetEmail.trim());
        setPassword('');
        setResetToken('');
        setNextPassword('');
        return;
      }

      if (!identifier.trim() || !password.trim()) {
        setError('Email or username and password are required.');
        return;
      }

      if (isRegister && !fullName.trim()) {
        setError('Full name is required for registration.');
        return;
      }

      const response = isRegister
        ? await registerUser(identifier.trim(), password, fullName.trim())
        : await signIn(identifier.trim(), password);

      onAuthenticated(response.token, response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-layout">
        <div className="auth-panel auth-panel--brand">
          <span className="auth-kicker">Field Operations Portal</span>
          <h1 className="auth-hero-title">Run surveys, sync reports, and review site risk from one login.</h1>
          <p className="auth-hero-copy">
            The dashboard gives authenticated teams a single surface for field collection, engineering exports,
            and survey history.
          </p>

          <div className="auth-feature-list" aria-hidden="true">
            <div className="auth-feature-item">
              <strong>Protected survey data</strong>
              <span>Bearer-authenticated access to surveys, categories, exports, and reports.</span>
            </div>
            <div className="auth-feature-item">
              <strong>Session recovery</strong>
              <span>Startup validation and automatic sign-out when tokens expire.</span>
            </div>
            <div className="auth-feature-item">
              <strong>Field-ready workflow</strong>
              <span>Review inspection progress, pending sync, and engineer-ready output in one place.</span>
            </div>
          </div>
        </div>

        <section className="auth-panel auth-card">
          <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={`auth-mode-button ${isSignIn ? 'is-active' : ''}`}
              onClick={() => {
                setError(null);
                setNotice(null);
                setMode('signin');
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`auth-mode-button ${isRegister ? 'is-active' : ''}`}
              onClick={() => {
                setError(null);
                setNotice(null);
                setMode('register');
              }}
            >
              Register
            </button>
          </div>

          <h2 className="auth-title">{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>

          {notice && <div className="alert alert--warning">{notice}</div>}
          {error && <div className="alert alert--error">{error}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            {isRegister && (
              <label className="auth-label">
                <span className="auth-label-text">Full name</span>
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

            {(isSignIn || isRegister) && (
              <>
                <label className="auth-label">
                  <span className="auth-label-text">{isSignIn ? 'Email or username' : 'Email'}</span>
                  <input
                    className="auth-input"
                    type={isSignIn ? 'text' : 'email'}
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder={isSignIn ? 'admin or you@example.com' : 'you@example.com'}
                    autoComplete={isSignIn ? 'username' : 'email'}
                  />
                </label>

                <label className="auth-label">
                  <span className="auth-label-row">
                    <span className="auth-label-text">Password</span>
                    <span className="auth-helper-text">{isRegister ? 'Minimum 8 characters' : 'Use your existing account password'}</span>
                  </span>
                  <div className="auth-password-row">
                    <input
                      className="auth-input auth-input--password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              </>
            )}

            {isForgot && (
              <label className="auth-label">
                <span className="auth-label-text">Account email</span>
                <input
                  className="auth-input"
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
            )}

            {isReset && (
              <>
                <label className="auth-label">
                  <span className="auth-label-text">Account email</span>
                  <input
                    className="auth-input"
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>

                <label className="auth-label">
                  <span className="auth-label-text">Reset token</span>
                  <input
                    className="auth-input"
                    type="text"
                    value={resetToken}
                    onChange={(event) => setResetToken(event.target.value)}
                    placeholder="Paste the token from your email"
                  />
                </label>

                <label className="auth-label">
                  <span className="auth-label-text">New password</span>
                  <input
                    className="auth-input"
                    type="password"
                    value={nextPassword}
                    onChange={(event) => setNextPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </label>
              </>
            )}

            <button type="submit" className="btn btn--primary auth-submit" disabled={loading}>
              {loading ? 'Please wait...' : isRegister ? 'Create Account' : isForgot ? 'Send Reset Email' : isReset ? 'Update Password' : 'Sign In'}
            </button>
          </form>

          {isSignIn && (
            <>
              <div className="auth-admin-callout">
                <p><strong>Admin quick login:</strong> username <code>admin</code> password <code>admin123!</code></p>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    setIdentifier('admin');
                    setPassword('admin123!');
                  }}
                >
                  Fill admin credentials
                </button>
              </div>

              <div className="auth-social-row">
                <button type="button" className="btn btn--outline btn--sm" disabled={socialLoading !== ''} onClick={() => handleSocialSignIn('google')}>
                  {socialLoading === 'google' ? 'Connecting...' : 'Continue with Google'}
                </button>
                <button type="button" className="btn btn--outline btn--sm" disabled={socialLoading !== ''} onClick={() => handleSocialSignIn('microsoft')}>
                  {socialLoading === 'microsoft' ? 'Connecting...' : 'Continue with Microsoft'}
                </button>
                <button type="button" className="btn btn--outline btn--sm" disabled={socialLoading !== ''} onClick={() => handleSocialSignIn('apple')}>
                  {socialLoading === 'apple' ? 'Connecting...' : 'Continue with Apple'}
                </button>
              </div>
            </>
          )}

          <p className="auth-footer-copy">
            {isRegister
              ? 'Registration creates a local dashboard account backed by the protected API.'
              : isForgot
              ? 'We send a reset token using configured SMTP credentials. In development, token preview is returned in the response.'
              : isReset
              ? 'Paste your token and choose a new password to complete account recovery.'
              : 'Signing in restores your dashboard session and unlocks protected survey routes.'}
          </p>

          {isSignIn && (
            <button type="button" className="btn btn--ghost auth-toggle" onClick={() => { setError(null); setNotice(null); setMode('forgot'); }}>
              Forgot password?
            </button>
          )}

          {!isReset && (
            <button
              type="button"
              className="btn btn--ghost auth-toggle"
              onClick={() => {
                setError(null);
                setNotice(null);
                if (isForgot) {
                  setMode('reset');
                  setResetEmail(resetEmail || identifier);
                  return;
                }
                setMode((prev) => (prev === 'signin' ? 'register' : 'signin'));
              }}
            >
              {isRegister ? 'Already have an account? Sign in' : isForgot ? 'I have a reset token' : 'Need an account? Register'}
            </button>
          )}

          {(isForgot || isReset) && (
            <button type="button" className="btn btn--ghost auth-toggle" onClick={() => { setError(null); setNotice(null); setMode('signin'); }}>
              Back to sign in
            </button>
          )}
        </section>
      </section>
    </div>
  );
}

export default AuthScreen;
