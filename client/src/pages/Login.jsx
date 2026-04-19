import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearSessionToken, login, setSessionToken, signup, verifyFace } from '../lib/api';
import { captureHiddenFaceEvidence, getDemoEmbedding, isDemoQueryEnabled } from '../lib/face';

const INITIAL_FORM = {
  email: '',
  password: '',
};

export default function LoginPage({ app, mode = 'login' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState(mode);
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [redirectAfterAuth, setRedirectAfterAuth] = useState(false);
  const demoQueryEnabled = useMemo(() => isDemoQueryEnabled(), []);
  const isBusy = status === 'submitting' || status === 'verifying';
  const isSignup = view === 'signup';

  useEffect(() => {
    setView(mode);
    setStatus('idle');
    setError('');
  }, [mode]);

  useEffect(() => {
    if (!redirectAfterAuth || !app.me) {
      return;
    }

    navigate(location.state?.from || '/files', { replace: true });
  }, [app.me, location.state, navigate, redirectAfterAuth]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('submitting');
    setError('');

    try {
      if (isSignup) {
        const result = await signup(form);
        app.setSessionToken(result.session_token);
        navigate('/enroll');
        return;
      }

      const result = await login(form);

      if (result.needs_face_check) {
        setSessionToken(result.session_token);
        setRedirectAfterAuth(false);
        setStatus('verifying');
        await completeHiddenVerification(result.session_token);
        return;
      }

      app.setSessionToken(result.session_token);
      await app.refreshMe();
      setRedirectAfterAuth(true);
    } catch (requestError) {
      setStatus('idle');
      setError(getAuthErrorMessage(requestError));
    }
  }

  async function completeHiddenVerification(token) {
    try {
      setSessionToken(token);
      const hiddenEvidence = demoQueryEnabled
        ? { embedding: getDemoEmbedding(), stillImage: null }
        : await captureHiddenFaceEvidence();
      await verifyFace(hiddenEvidence);
      app.setSessionToken(token);
      await app.refreshMe();
      setRedirectAfterAuth(true);
    } catch (verificationError) {
      clearSessionToken();
      setError(verificationError.message || 'Unable to verify your face.');
      throw verificationError;
    } finally {
      setStatus('idle');
    }
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function swapMode() {
    const next = isSignup ? 'login' : 'signup';
    setView(next);
    setStatus('idle');
    setError('');
    navigate(next === 'signup' ? '/signup' : '/login', { replace: true });
  }

  const submitLabel = (() => {
    if (status === 'submitting') return isSignup ? 'Creating...' : 'Signing in...';
    if (status === 'verifying') return 'Verifying...';
    return isSignup ? 'Create account' : 'Log in';
  })();

  return (
    <div className="editorial-shell">
      <div className="editorial-vignette" aria-hidden="true" />
      <main className="editorial-card">
        <header className="editorial-header">
          <h1 className="editorial-wordmark">Mirage</h1>
          <p className="editorial-eyebrow">
            {isSignup ? 'Create your archive' : 'Welcome back'}
          </p>
        </header>

        <form className="editorial-form" onSubmit={handleSubmit}>
          <label className="editorial-field">
            <span className="editorial-label">Email address</span>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              disabled={isBusy}
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="editorial-field">
            <span className="editorial-label">Password</span>
            <input
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              disabled={isBusy}
              placeholder="••••••••••••"
              required
            />
          </label>

          {error ? <p className="editorial-error">{error}</p> : null}

          <button type="submit" className="editorial-submit" disabled={isBusy}>
            {submitLabel}
          </button>
        </form>

        <p className="editorial-switch">
          {isSignup ? 'Already have an account? ' : 'Need an account? '}
          <button
            type="button"
            className="editorial-link"
            disabled={isBusy}
            onClick={swapMode}
          >
            {isSignup ? 'Log in' : 'Create one'}
          </button>
        </p>

        <p className="editorial-badge">
          <svg
            className="editorial-badge-icon"
            viewBox="0 0 14 14"
            aria-hidden="true"
          >
            <path
              d="M7 1 L12 3 V7 C12 9.5 10 11.5 7 13 C4 11.5 2 9.5 2 7 V3 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
          </svg>
          End-to-end encryption
        </p>
      </main>
    </div>
  );
}

function getAuthErrorMessage(error) {
  if (error.status === 401) {
    return 'The email or password was not recognized.';
  }

  if (error.status === 409) {
    return 'That email is already registered.';
  }

  return error.message || 'Unable to complete this request right now.';
}
