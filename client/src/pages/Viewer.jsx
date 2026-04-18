import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getFileContent, getFiles } from '../lib/api';

export default function ViewerPage() {
  const { fileId } = useParams();
  const location = useLocation();
  const [fileMeta, setFileMeta] = useState(() => location.state?.file || null);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadViewer() {
      setStatus('loading');
      setError('');

      try {
        let resolvedMeta = fileMeta;
        if (!fileMeta) {
          const payload = await getFiles();
          resolvedMeta = (payload.files || []).find((entry) => entry.id === fileId) || null;
          if (!cancelled) {
            setFileMeta(resolvedMeta);
          }
        }

        const nextContent = await getFileContent(fileId);
        if (!cancelled) {
          setContent(typeof nextContent === 'string' ? nextContent : JSON.stringify(nextContent, null, 2));
          setStatus('ready');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Unable to open this document.');
          setStatus('error');
        }
      }
    }

    loadViewer();

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <div>
          <Link to="/files" className="back-link">{'<'}- Back to files</Link>
          <h1>{fileMeta?.name || 'Document viewer'}</h1>
        </div>
      </header>

      <main className="viewer-panel">
        {status === 'loading' ? <p className="panel-status">Opening document...</p> : null}
        {status === 'error' ? <p className="status-error">{error}</p> : null}
        {status === 'ready' ? <article className="document-body">{content}</article> : null}
      </main>
    </div>
  );
}
