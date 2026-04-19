import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HomePage({ app }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (app.isAuthed) {
      navigate('/files', { replace: true });
    }
  }, [app.isAuthed, navigate]);

  return (
    <div className="home-shell">
      <div className="home-vignette" aria-hidden="true" />
      <main className="home-panel">
        <h1 className="home-wordmark">Mirage</h1>
        <p className="home-tagline">Secure document storage</p>
        <div className="home-actions">
          <button
            type="button"
            className="home-primary"
            onClick={() => navigate('/login')}
          >
            Log in
          </button>
          <button
            type="button"
            className="home-secondary"
            onClick={() => navigate('/signup')}
          >
            Create account <span aria-hidden="true">→</span>
          </button>
        </div>
      </main>
      <footer className="home-footer">© 2026 Mirage Archive · All rights reserved</footer>
    </div>
  );
}
