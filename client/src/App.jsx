import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import EnrollPage from './pages/Enroll';
import FilesPage from './pages/Files';
import ViewerPage from './pages/Viewer';
import {
  clearSessionToken,
  getMe,
  getSessionToken,
  setSessionToken,
} from './lib/api';

function RequireAuth({ isAuthed, children }) {
  const location = useLocation();

  if (!isAuthed) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function AppShell({ sessionToken, setSessionTokenState, me, setMe, bootstrapState }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthed = Boolean(sessionToken && me);
  const isReady = bootstrapState !== 'loading';
  const appContext = useMemo(
    () => ({
      sessionToken,
      me,
      isAuthed,
      setSessionToken: (token) => {
        setSessionToken(token);
        setSessionTokenState(token);
      },
      clearSession: () => {
        clearSessionToken();
        setSessionTokenState(null);
        setMe(null);
        navigate('/');
      },
      refreshMe: async () => {
        const nextMe = await getMe();
        setMe(nextMe);
        return nextMe;
      },
    }),
    [me, navigate, sessionToken, setMe, setSessionTokenState],
  );

  useEffect(() => {
    if (bootstrapState === 'failed' && location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [bootstrapState, location.pathname, navigate]);

  if (!isReady) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading-panel">
          <div className="brand-mark">Mirage</div>
          <p>Restoring session...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LoginPage app={appContext} />} />
      <Route
        path="/enroll"
        element={(
          <RequireAuth isAuthed={Boolean(sessionToken)}>
            <EnrollPage app={appContext} />
          </RequireAuth>
        )}
      />
      <Route
        path="/files"
        element={(
          <RequireAuth isAuthed={isAuthed}>
            <FilesPage app={appContext} />
          </RequireAuth>
        )}
      />
      <Route
        path="/files/:fileId"
        element={(
          <RequireAuth isAuthed={isAuthed}>
            <ViewerPage />
          </RequireAuth>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [sessionToken, setSessionTokenState] = useState(() => getSessionToken());
  const [me, setMe] = useState(null);
  const [bootstrapState, setBootstrapState] = useState(sessionToken ? 'loading' : 'ready');

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!sessionToken) {
        setBootstrapState('ready');
        setMe(null);
        return;
      }

      setBootstrapState('loading');

      try {
        const profile = await getMe();
        if (!cancelled) {
          setMe(profile);
          setBootstrapState('ready');
        }
      } catch (error) {
        if (!cancelled) {
          clearSessionToken();
          setSessionTokenState(null);
          setMe(null);
          setBootstrapState('failed');
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  return (
    <AppShell
      sessionToken={sessionToken}
      setSessionTokenState={setSessionTokenState}
      me={me}
      setMe={setMe}
      bootstrapState={bootstrapState}
    />
  );
}
