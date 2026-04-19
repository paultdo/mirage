import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFiles, uploadFile } from '../lib/api';

function formatBytes(size) {
  if (!Number.isFinite(size)) {
    return 'Unknown';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp) {
  if (!timestamp) {
    return 'Unknown';
  }

  const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(millis);
}

function typeLabel(mimeType, name) {
  if (mimeType) {
    return mimeType.split('/').pop()?.toUpperCase() || mimeType;
  }

  const extension = name.includes('.') ? name.split('.').pop() : 'FILE';
  return extension.toUpperCase();
}

export default function FilesPage({ app }) {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [uploadState, setUploadState] = useState('idle');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [coverTopic, setCoverTopic] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const isDecoy = app.me?.mode === 'decoy';

  useEffect(() => {
    let cancelled = false;

    async function loadFiles() {
      setStatus('loading');
      setError('');

      try {
        await app.refreshMe();
        const payload = await getFiles();
        if (!cancelled) {
          setFiles(payload.files || []);
          setStatus('ready');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Unable to load files.');
          setStatus('error');
        }
      }
    }

    loadFiles();

    return () => {
      cancelled = true;
    };
  }, [app.sessionToken]);

  async function handleUpload(event) {
    event.preventDefault();
    setUploadError('');
    setUploadSuccess('');

    if (!selectedFile) {
      setUploadError('Choose a file before uploading.');
      return;
    }

    if (!isDecoy && !coverTopic.trim()) {
      setUploadError('Choose a file and add a cover topic before uploading.');
      return;
    }

    setUploadState('uploading');

    try {
      if (isDecoy) {
        setSelectedFile(null);
        setCoverTopic('');
        event.target.reset();
        setUploadState('idle');
        setUploadSuccess('File uploaded successfully.');
        return;
      }

      await uploadFile({
        file: selectedFile,
        coverTopic: coverTopic.trim(),
      });

      const payload = await getFiles();
      setFiles(payload.files || []);
      setSelectedFile(null);
      setCoverTopic('');
      event.target.reset();
      setUploadState('idle');
      setUploadSuccess('File uploaded successfully.');
    } catch (uploadRequestError) {
      setUploadState('idle');
      setUploadError(getUploadErrorMessage(uploadRequestError));
    }
  }

  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <div>
          <div className="brand-mark">Mirage</div>
          <h1>Files</h1>
        </div>
        <div className="workspace-actions">
          <span className="user-chip">{app.me?.email || 'Signed in'}</span>
          <button type="button" className="ghost-button" onClick={app.clearSession}>
            Sign out
          </button>
        </div>
      </header>

      <main className="workspace-grid">
        <section className="panel upload-panel">
          <div className="panel-heading">
            <h2>Upload</h2>
            <p>{isDecoy ? 'Add a document to your workspace.' : 'Add a document and describe the decoy version it should imply.'}</p>
          </div>
          <form className="upload-form" onSubmit={handleUpload}>
            <label className="field">
              <span>Document</span>
              <input
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                required
              />
            </label>

            {!isDecoy ? (
              <label className="field">
                <span>Cover topic</span>
                <textarea
                  rows="4"
                  value={coverTopic}
                  onChange={(event) => setCoverTopic(event.target.value)}
                  placeholder="Q1 vendor review, compliance update, internal planning memo..."
                  required
                />
              </label>
            ) : null}

            {uploadError ? <p className="status-error">{uploadError}</p> : null}
            {uploadSuccess ? <p className="status-success">{uploadSuccess}</p> : null}

            <button type="submit" className="primary-button" disabled={uploadState === 'uploading'}>
              {uploadState === 'uploading' ? 'Uploading...' : 'Upload file'}
            </button>
          </form>
        </section>

        <section className="panel files-panel">
          <div className="panel-heading">
            <h2>Documents</h2>
            <p>Open a file to view its contents.</p>
          </div>

          {status === 'loading' ? <p className="panel-status">Loading files...</p> : null}
          {status === 'error' ? <p className="status-error">{error}</p> : null}

          {status === 'ready' ? (
            files.length ? (
              <div className="table-wrap">
                <table className="files-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.id}>
                        <td>
                          <Link className="file-link" to={`/files/${file.id}`} state={{ file }}>
                            {file.name}
                          </Link>
                        </td>
                        <td>{typeLabel(file.mime_type, file.name)}</td>
                        <td>{formatBytes(file.size_bytes)}</td>
                        <td>{formatDate(file.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="panel-status">No files uploaded yet.</p>
            )
          ) : null}
        </section>
      </main>
    </div>
  );
}

function getUploadErrorMessage(error) {
  if (error.status === 403) {
    return 'This workspace is not accepting uploads right now.';
  }

  return error.message || 'Unable to upload this file right now.';
}
