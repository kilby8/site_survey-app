import { useEffect, useState } from 'react';
import Header from './components/Header';
import SurveyList from './components/SurveyList';
import SurveyFormV2 from './components/SurveyFormV2';
import AuthScreen from './components/AuthScreen';
import { getCurrentUser } from './api/authApi';
import type { AuthUser } from './api/authApi';
import { AUTH_UNAUTHORIZED_EVENT } from './api/authEvents';
import { getTokenExpiryMs } from './api/tokenUtils';
import { useOfflineSync } from './hooks/useOfflineSync';
import './App.css';

type View = { page: 'list' } | { page: 'new' } | { page: 'edit'; id: string };

function App() {
  const [view, setView] = useState<View>({ page: 'list' });
  const [listRefresh, setListRefresh] = useState(0);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [isSessionChecking, setIsSessionChecking] = useState<boolean>(() => Boolean(localStorage.getItem('auth_token')));
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('auth_user');
    if (!saved) return null;
    try {
      return JSON.parse(saved) as AuthUser;
    } catch {
      return null;
    }
  });
  const { isOnline, queueLength } = useOfflineSync();

  const handleSaved = () => {
    setListRefresh(n => n + 1);
    setView({ page: 'list' });
  };

  const handleAuthenticated = (token: string, user: AuthUser) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    setAuthToken(token);
    setAuthUser(user);
    setSessionNotice(null);
  };

  const handleSignOut = (message?: string) => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setAuthToken(null);
    setAuthUser(null);
    setSessionNotice(message || null);
    setView({ page: 'list' });
  };

  useEffect(() => {
    const onUnauthorized = () => {
      handleSignOut('Your session expired. Please sign in again.');
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  useEffect(() => {
    if (!authToken) {
      setIsSessionChecking(false);
      return;
    }

    let isCancelled = false;
    setIsSessionChecking(true);

    getCurrentUser(authToken)
      .then((user) => {
        if (isCancelled) return;
        localStorage.setItem('auth_user', JSON.stringify(user));
        setAuthUser(user);
      })
      .catch((err) => {
        if (isCancelled) return;
        const message = err instanceof Error ? err.message : 'Could not verify session';
        if (message.toLowerCase().includes('session expired')) {
          handleSignOut('Your session expired. Please sign in again.');
        }
      })
      .finally(() => {
        if (isCancelled) return;
        setIsSessionChecking(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;

    const expiryMs = getTokenExpiryMs(authToken);
    if (!expiryMs) return;

    const remainingMs = expiryMs - Date.now();
    if (remainingMs <= 0) {
      handleSignOut('Your session expired. Please sign in again.');
      return;
    }

    const timer = window.setTimeout(() => {
      handleSignOut('Your session expired. Please sign in again.');
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [authToken]);

  if (isSessionChecking) {
    return (
      <div className="loading-state">
        <div className="spinner" aria-hidden="true" />
        <p>Verifying your session...</p>
      </div>
    );
  }

  if (!authToken || !authUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} initialMessage={sessionNotice} />;
  }

  if (view.page === 'new') {
    return (
      <SurveyFormV2
        onSaved={handleSaved}
        onCancel={() => setView({ page: 'list' })}
      />
    );
  }

  if (view.page === 'edit') {
    return (
      <SurveyFormV2
        surveyId={view.id}
        onSaved={handleSaved}
        onCancel={() => setView({ page: 'list' })}
      />
    );
  }

  const headerTitle = 'Site Surveys';

  return (
    <div className="app">
      <Header
        title={headerTitle}
        isOnline={isOnline}
        pendingSync={queueLength}
      />
      <main className="main-content">
        <section className="session-bar">
          <p className="session-user">Signed in as <strong>{authUser.fullName}</strong></p>
          <button className="btn btn--outline btn--sm" onClick={() => handleSignOut()}>Sign out</button>
        </section>
        <SurveyList
          onNewSurvey={() => setView({ page: 'new' })}
          onEditSurvey={(id) => setView({ page: 'edit', id })}
          refreshTrigger={listRefresh}
        />
      </main>
    </div>
  );
}

export default App;
