import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Webcam from '../components/Webcam';
import { login, setSessionToken, signup, verifyFace } from '../lib/api';
import { extractFaceEmbedding, getDemoEmbedding, isDemoQueryEnabled } from '../lib/face';

const INITIAL_FORM = {
  email: '',
  password: '',
};

export default function LoginPage({ app }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState('login');
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const demoQueryEnabled = useMemo(() => isDemoQueryEnabled(), []);

  useEffect(() => {
    if (!app.isAuthed) {
      return;
    }

    navigate(location.state?.from || '/files', { replace: true });
  }, [app.isAuthed, location.state, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('submitting');
    setError('');

    try {
      if (view === 'signup') {
        const result = await signup(form);
        app.setSessionToken(result.session_token);
        navigate('/enroll');
        return;
      }

      const result = await login(form);
      app.setSessionToken(result.session_token);

      if (result.needs_face_check) {
        setVerificationToken(result.session_token);
        setStatus('verifying');
        return;
      }

      await app.refreshMe();
    } catch (requestError) {
      setStatus('idle');
      setError(getAuthErrorMessage(requestError));
    }
  }

  async function handleVerify(videoElement) {
    try {
      setSessionToken(verificationToken || app.sessionToken);
      const embedding = demoQueryEnabled ? getDemoEmbedding() : await extractFaceEmbedding(videoElement);
      await verifyFace({ embedding });
      await app.refreshMe();
    } catch (verificationError) {
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

  return (
    <div className="auth-shell">
      <section className="auth-panel">
        <div className="brand-block">
          <div className="brand-mark">Mirage</div>
          <h1>Secure document access</h1>
          <p>Access your files through a quiet, familiar workflow. No extra mode indicators. No extra noise.</p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={view === 'login' ? 'tab-button active' : 'tab-button'}
              onClick={() => {
                setView('login');
                setStatus('idle');
                setError('');
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={view === 'signup' ? 'tab-button active' : 'tab-button'}
              onClick={() => {
                setView('signup');
                setStatus('idle');
                setError('');
              }}
            >
              Sign up
            </button>
          </div>

          {status === 'verifying' ? (
            <Webcam
              title="Completing sign-in"
              description="A quick face check is used to continue into your workspace."
              actionLabel="Retry verification"
              busyLabel="Verifying..."
              autoCapture
              onCapture={handleVerify}
            />
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  required
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  required
                />
              </label>

              {error ? <p className="status-error">{error}</p> : null}

              <button type="submit" className="primary-button" disabled={status === 'submitting'}>
                {status === 'submitting'
                  ? view === 'signup'
                    ? 'Creating account...'
                    : 'Signing in...'
                  : view === 'signup'
                    ? 'Create account'
                    : 'Continue'}
              </button>
            </form>
          )}
        </div>
      </section>
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
