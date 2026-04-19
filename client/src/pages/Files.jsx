import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteFile,
  getAlertDetails,
  getAlertEvidenceImageUrl,
  getAlerts,
  getFiles,
  markAlertsSeen,
  uploadFile,
} from '../lib/api';

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
  const [deleteState, setDeleteState] = useState({ status: 'idle', fileId: null });
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [coverTopic, setCoverTopic] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [alertDetailState, setAlertDetailState] = useState({
    status: 'idle',
    alert: null,
    evidence: null,
    imageUrl: '',
    error: '',
  });
  const isDecoy = app.me?.mode === 'decoy';

  useEffect(() => {
    let cancelled = false;

    async function loadFiles() {
      setStatus('loading');
      setError('');

      try {
        await app.refreshMe();
        const [filesPayload, alertsPayload] = await Promise.all([
          getFiles(),
          getAlerts(),
        ]);
        if (!cancelled) {
          setFiles(filesPayload.files || []);
          setAlerts(alertsPayload.alerts || []);
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

  useEffect(() => () => {
    if (alertDetailState.imageUrl) {
      URL.revokeObjectURL(alertDetailState.imageUrl);
    }
  }, [alertDetailState.imageUrl]);

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

  async function handleDelete(file) {
    const confirmed = window.confirm(`Delete "${file.name}"?`);
    if (!confirmed) {
      return;
    }

    setUploadError('');
    setUploadSuccess('');
    setDeleteState({ status: 'deleting', fileId: file.id });

    try {
      await deleteFile(file.id);

      if (!isDecoy) {
        setFiles((currentFiles) => currentFiles.filter((entry) => entry.id !== file.id));
      }

      setUploadSuccess(`${isDecoy ? 'Delete request completed.' : 'File deleted successfully.'}`);
    } catch (deleteRequestError) {
      setUploadError(getDeleteErrorMessage(deleteRequestError));
    } finally {
      setDeleteState({ status: 'idle', fileId: null });
    }
  }

  async function handleAlertClick(alertId) {
    const activeAlert = alerts.find((entry) => entry.id === alertId) || null;

    if (alertDetailState.imageUrl) {
      URL.revokeObjectURL(alertDetailState.imageUrl);
    }

    setSelectedAlertId(alertId);
    setAlertDetailState({
      status: 'loading',
      alert: activeAlert,
      evidence: null,
      imageUrl: '',
      error: '',
    });

    try {
      const payload = await getAlertDetails(alertId);
      let imageUrl = '';

      if (payload.evidence?.id) {
        imageUrl = await getAlertEvidenceImageUrl(payload.evidence.id);
      }

      setAlertDetailState({
        status: 'ready',
        alert: payload.alert,
        evidence: payload.evidence,
        imageUrl,
        error: '',
      });
    } catch (detailError) {
      setAlertDetailState({
        status: 'error',
        alert: activeAlert,
        evidence: null,
        imageUrl: '',
        error: detailError.message || 'Unable to load alert details.',
      });
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
                      <th>Actions</th>
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
                        <td>
                          <button
                            type="button"
                            className="ghost-button row-action-button"
                            disabled={deleteState.status === 'deleting' && deleteState.fileId === file.id}
                            onClick={() => handleDelete(file)}
                          >
                            {deleteState.status === 'deleting' && deleteState.fileId === file.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
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

        {!isDecoy && alerts.length > 0 ? (
          <section className="panel alerts-panel">
            <div className="panel-heading">
              <h2>Security Alerts</h2>
              <button
                type="button"
                className="ghost-button"
                onClick={async () => {
                  if (alertDetailState.imageUrl) {
                    URL.revokeObjectURL(alertDetailState.imageUrl);
                  }
                  await markAlertsSeen();
                  setAlerts([]);
                  setSelectedAlertId(null);
                  setAlertDetailState({
                    status: 'idle',
                    alert: null,
                    evidence: null,
                    imageUrl: '',
                    error: '',
                  });
                }}
              >
                Dismiss all
              </button>
            </div>
            <div className="alerts-content">
              <ul className="alerts-list">
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <button
                      type="button"
                      className={selectedAlertId === alert.id ? 'alert-item alert-item-button active' : 'alert-item alert-item-button'}
                      onClick={() => handleAlertClick(alert.id)}
                    >
                      <span className="alert-event">{formatAlertEvent(alert.event_type)}</span>
                      <span className="alert-file">{alert.file_name}</span>
                      <span className="alert-time">{formatDate(alert.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <aside className="alerts-detail">
                <h3>Alert Details</h3>
                {alertDetailState.status === 'idle' ? <p className="panel-status">Select an alert to inspect the intruder evidence.</p> : null}
                {alertDetailState.status === 'loading' ? <p className="panel-status">Loading alert details...</p> : null}
                {alertDetailState.status === 'error' ? <p className="status-error">{alertDetailState.error}</p> : null}
                {alertDetailState.alert ? (
                  <div className="alert-detail-body">
                    <div className="alert-detail-grid">
                      <div>
                        <span className="alert-detail-label">Event</span>
                        <p>{formatAlertEvent(alertDetailState.alert.event_type)}</p>
                      </div>
                      <div>
                        <span className="alert-detail-label">File</span>
                        <p>{alertDetailState.alert.file_name}</p>
                      </div>
                      <div>
                        <span className="alert-detail-label">Time</span>
                        <p>{formatDateTime(alertDetailState.alert.created_at)}</p>
                      </div>
                      <div>
                        <span className="alert-detail-label">Evidence</span>
                        <p>{alertDetailState.evidence ? formatDateTime(alertDetailState.evidence.captured_at) : 'No visual evidence available'}</p>
                      </div>
                    </div>

                    {alertDetailState.imageUrl ? (
                      <img
                        className="alert-photo"
                        src={alertDetailState.imageUrl}
                        alt="Captured face evidence from decoy session"
                      />
                    ) : (
                      <p className="panel-status">No visual evidence available for this alert.</p>
                    )}
                  </div>
                ) : null}
              </aside>
            </div>
          </section>
        ) : null}
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

function formatAlertEvent(eventType) {
  switch (eventType) {
    case 'file_uploaded': return 'Uploaded';
    case 'file_viewed': return 'Viewed';
    case 'file_deleted': return 'Deleted';
    default: return eventType;
  }
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return 'Unknown';
  }

  const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(millis);
}

function getDeleteErrorMessage(error) {
  if (error.status === 404) {
    return 'This file is no longer available.';
  }

  return error.message || 'Unable to delete this file right now.';
}
