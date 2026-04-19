import { useEffect, useRef, useState } from 'react';
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

function extractExtension(name, mimeType) {
  if (name && name.includes('.')) {
    return name.split('.').pop().toLowerCase();
  }
  if (mimeType) {
    return mimeType.split('/').pop().toLowerCase();
  }
  return '';
}

const BADGE_MAP = {
  pdf: ['PDF', 'pdf'],
  doc: ['DOC', 'doc'],
  docx: ['DOC', 'doc'],
  xls: ['XLS', 'xls'],
  xlsx: ['XLS', 'xls'],
  csv: ['CSV', 'xls'],
  png: ['IMG', 'img'],
  jpg: ['IMG', 'img'],
  jpeg: ['IMG', 'img'],
  gif: ['IMG', 'img'],
  webp: ['IMG', 'img'],
  svg: ['IMG', 'img'],
  txt: ['TXT', 'txt'],
  md: ['MD', 'txt'],
  zip: ['ZIP', 'zip'],
  tar: ['TAR', 'zip'],
  gz: ['GZ', 'zip'],
};

function getFileBadge(file) {
  const ext = extractExtension(file.name, file.mime_type);
  const hit = BADGE_MAP[ext];
  if (hit) {
    return { label: hit[0], variant: hit[1] };
  }
  return { label: (ext.toUpperCase().slice(0, 3)) || 'FIL', variant: 'default' };
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [alertDetailState, setAlertDetailState] = useState({
    status: 'idle',
    alert: null,
    evidence: null,
    imageUrl: '',
    error: '',
  });
  const alertsSectionRef = useRef(null);
  const isDecoy = app.me?.mode === 'decoy';
  const hasAlerts = !isDecoy && alerts.length > 0;

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

  useEffect(() => {
    if (hasAlerts && !selectedAlertId) {
      handleAlertClick(alerts[0].id);
    }
  }, [hasAlerts, alerts, selectedAlertId]);

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
        setUploadOpen(false);
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
      setUploadOpen(false);
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

  async function handleDismissAlerts() {
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
  }

  function scrollToAlerts() {
    alertsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeUploadModal() {
    if (uploadState === 'uploading') return;
    setUploadOpen(false);
    setUploadError('');
  }

  return (
    <div className="editorial-workspace">
      <div className="editorial-vignette" aria-hidden="true" />

      <header className="editorial-topbar">
        <div className="editorial-topbar-left">
          <span className="editorial-topbar-wordmark">Mirage</span>
          <button
            type="button"
            className="editorial-bell"
            onClick={scrollToAlerts}
            disabled={!hasAlerts}
            aria-label={hasAlerts ? `${alerts.length} security alerts` : 'No new alerts'}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" width="18" height="18">
              <path
                d="M10 2.5 C7 2.5 5 4.5 5 7.5 V10.5 L3.5 13 H16.5 L15 10.5 V7.5 C15 4.5 13 2.5 10 2.5 Z M8 14.5 C8 15.6 8.9 16.5 10 16.5 C11.1 16.5 12 15.6 12 14.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {hasAlerts ? <span className="editorial-bell-dot" aria-hidden="true" /> : null}
          </button>
          <button
            type="button"
            className="editorial-upload-button"
            onClick={() => {
              setUploadError('');
              setUploadSuccess('');
              setUploadOpen(true);
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" width="15" height="15">
              <path
                d="M10 13.5 V4.5 M6 8 L10 4 L14 8 M4.5 15.5 H15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Upload
          </button>
        </div>
        <div className="editorial-topbar-right">
          <span className="editorial-user-chip" title={app.me?.email || ''}>
            {app.me?.email || 'Signed in'}
          </span>
          <button type="button" className="editorial-signout" onClick={app.clearSession}>
            Sign Out
          </button>
        </div>
      </header>

      <main className="editorial-workspace-main">
        <h1 className="editorial-workspace-title">Files</h1>

        {uploadSuccess ? <p className="editorial-status-success editorial-workspace-banner">{uploadSuccess}</p> : null}
        {uploadError && !uploadOpen ? <p className="editorial-error editorial-workspace-banner">{uploadError}</p> : null}

        {status === 'loading' ? <p className="editorial-workspace-muted">Loading files...</p> : null}
        {status === 'error' ? <p className="editorial-error">{error}</p> : null}

        {status === 'ready' && files.length > 0 ? (
          <>
            <div className="editorial-files-headers">
              <span>Name</span>
              <span>Modified</span>
              <span className="editorial-files-headers-right">Size</span>
            </div>
            <ul className="editorial-files-list">
              {files.map((file) => {
                const badge = getFileBadge(file);
                const isDeleting = deleteState.status === 'deleting' && deleteState.fileId === file.id;
                return (
                  <li key={file.id} className="editorial-file-row-wrapper">
                    <Link
                      className="editorial-file-row"
                      to={`/files/${file.id}`}
                      state={{ file }}
                    >
                      <span className="editorial-file-name-cell">
                        <span className={`editorial-file-badge editorial-file-badge-${badge.variant}`}>
                          {badge.label}
                        </span>
                        <span className="editorial-file-name">{file.name}</span>
                      </span>
                      <span className="editorial-file-meta">{formatDate(file.created_at)}</span>
                      <span className="editorial-file-meta editorial-file-meta-right">{formatBytes(file.size_bytes)}</span>
                    </Link>
                    <button
                      type="button"
                      className="editorial-row-delete"
                      disabled={isDeleting}
                      onClick={() => handleDelete(file)}
                      aria-label={`Delete ${file.name}`}
                    >
                      {isDeleting ? 'Deleting' : 'Delete'}
                    </button>
                  </li>
                );
              })}
            </ul>
            <footer className="editorial-workspace-footer">
              <span>{files.length} {files.length === 1 ? 'file' : 'files'} listed in Archive</span>
            </footer>
          </>
        ) : status === 'ready' ? (
          <div className="editorial-files-empty">
            <p>Your archive is empty. Upload your first document to begin.</p>
          </div>
        ) : null}

        {hasAlerts ? (
          <section className="editorial-alerts" ref={alertsSectionRef}>
            <div className="editorial-alerts-heading">
              <div>
                <p className="editorial-eyebrow">Signal</p>
                <h2 className="editorial-alerts-title">Security events</h2>
              </div>
              <button type="button" className="editorial-ghost editorial-ghost-sm" onClick={handleDismissAlerts}>
                Dismiss all
              </button>
            </div>

            <div className="editorial-alerts-layout">
              <aside className="editorial-alerts-sidebar">
                <p className="editorial-alerts-sidebar-label">All events</p>
                <ul className="editorial-alerts-list">
                  {alerts.map((alert) => {
                    const isActive = selectedAlertId === alert.id;
                    return (
                      <li key={alert.id}>
                        <button
                          type="button"
                          className={isActive ? 'editorial-alert-card active' : 'editorial-alert-card'}
                          onClick={() => handleAlertClick(alert.id)}
                        >
                          <span className={`editorial-alert-dot editorial-alert-dot-${alertSeverity(alert)}`} aria-hidden="true" />
                          <span className="editorial-alert-card-body">
                            <span className="editorial-alert-card-title">{alertTitle(alert)}</span>
                            <span className="editorial-alert-card-subtitle">{alert.file_name}</span>
                          </span>
                          <span className="editorial-alert-card-time">{relativeDay(alert.created_at)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              <div className="editorial-alerts-detail-pane">
                {!alertDetailState.alert && alertDetailState.status === 'idle' ? (
                  <div className="editorial-alerts-empty">
                    <p>Select an event to inspect the captured evidence.</p>
                  </div>
                ) : null}

                {alertDetailState.alert ? (
                  <>
                    <header className="editorial-alerts-detail-header">
                      <h3 className="editorial-alerts-detail-title">{alertTitle(alertDetailState.alert)}</h3>
                      <p className="editorial-alerts-detail-time">
                        {formatDateTime(alertDetailState.alert.created_at)}
                      </p>
                    </header>

                    <div className="editorial-alerts-evidence">
                      {alertDetailState.imageUrl ? (
                        <img
                          className="editorial-alerts-evidence-image"
                          src={alertDetailState.imageUrl}
                          alt="Captured face evidence from decoy session"
                        />
                      ) : (
                        <div className="editorial-alerts-evidence-empty">
                          {alertDetailState.status === 'loading'
                            ? 'Loading evidence...'
                            : alertDetailState.status === 'error'
                              ? alertDetailState.error
                              : 'No visual evidence available'}
                        </div>
                      )}
                    </div>

                    <div className="editorial-alerts-meta">
                      <section>
                        <p className="editorial-eyebrow">Threat analysis</p>
                        <dl className="editorial-alerts-meta-grid">
                          <div>
                            <dt>Event</dt>
                            <dd>{formatAlertEvent(alertDetailState.alert.event_type)}</dd>
                          </div>
                          <div>
                            <dt>File</dt>
                            <dd>{alertDetailState.alert.file_name}</dd>
                          </div>
                          <div>
                            <dt>Detected</dt>
                            <dd>{formatDateTime(alertDetailState.alert.created_at)}</dd>
                          </div>
                          <div>
                            <dt>Evidence captured</dt>
                            <dd>{alertDetailState.evidence ? formatDateTime(alertDetailState.evidence.captured_at) : '—'}</dd>
                          </div>
                        </dl>
                      </section>
                    </div>

                    <footer className="editorial-alerts-banner">
                      Decoy session triggered · intruder never reached the real archive.
                    </footer>
                  </>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {uploadOpen ? (
        <div className="editorial-modal-backdrop" onClick={closeUploadModal}>
          <div className="editorial-modal" onClick={(event) => event.stopPropagation()}>
            <header className="editorial-modal-header">
              <div>
                <p className="editorial-eyebrow">New document</p>
                <h2 className="editorial-modal-title">Upload</h2>
              </div>
              <button
                type="button"
                className="editorial-modal-close"
                onClick={closeUploadModal}
                aria-label="Close upload"
                disabled={uploadState === 'uploading'}
              >
                ×
              </button>
            </header>

            <form className="editorial-form" onSubmit={handleUpload}>
              <label className="editorial-field">
                <span className="editorial-label">Document</span>
                <input
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  required
                />
              </label>

              {!isDecoy ? (
                <label className="editorial-field">
                  <span className="editorial-label">Cover topic</span>
                  <textarea
                    rows="3"
                    value={coverTopic}
                    onChange={(event) => setCoverTopic(event.target.value)}
                    placeholder="Q1 vendor review, compliance update, internal planning memo..."
                    required
                  />
                </label>
              ) : null}

              {uploadError ? <p className="editorial-error">{uploadError}</p> : null}

              <button type="submit" className="editorial-submit" disabled={uploadState === 'uploading'}>
                {uploadState === 'uploading' ? 'Uploading...' : 'Upload file'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
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

function alertTitle(alert) {
  switch (alert.event_type) {
    case 'file_viewed': return 'Unrecognized file access';
    case 'file_uploaded': return 'Intruder uploaded a document';
    case 'file_deleted': return 'Intruder attempted deletion';
    default: return 'Security event';
  }
}

function alertSeverity(alert) {
  if (alert.event_type === 'file_deleted' || alert.event_type === 'file_uploaded') {
    return 'critical';
  }
  return 'warning';
}

function relativeDay(timestamp) {
  if (!timestamp) return '';
  const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const then = new Date(millis);
  const now = new Date();
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const diffDays = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(millis);
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
