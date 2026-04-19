const SESSION_TOKEN_KEY = 'mirage.session_token';

function getBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  return configured ? configured.replace(/\/$/, '') : '';
}

function buildUrl(path) {
  return `${getBaseUrl()}${path}`;
}

export function getSessionToken() {
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setSessionToken(token) {
  window.localStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearSessionToken() {
  window.localStorage.removeItem(SESSION_TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getSessionToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(
      typeof payload === 'object' && payload?.error
        ? payload.error
        : `Request failed with status ${response.status}`,
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function signup({ email, password }) {
  return request('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function login({ email, password }) {
  return request('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function enrollFace({ embedding }) {
  return request('/api/enroll-face', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedding }),
  });
}

export function verifyFace({ embedding, stillImage = null }) {
  return request('/api/verify-face', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedding, still_image: stillImage }),
  });
}

export function getMe() {
  return request('/api/me');
}

export function getFiles() {
  return request('/api/files');
}

export function uploadFile({ file, coverTopic }) {
  const body = new FormData();
  body.append('file', file);
  body.append('cover_topic', coverTopic);

  return request('/api/files', {
    method: 'POST',
    headers: {},
    body,
  });
}

export function getFileContent(fileId) {
  return request(`/api/files/${fileId}/content`);
}

export function deleteFile(fileId) {
  return request(`/api/files/${fileId}`, {
    method: 'DELETE',
  });
}

export function getAlerts() {
  return request('/api/alerts');
}

export function getAlertDetails(alertId) {
  return request(`/api/alerts/${alertId}`);
}

export async function getAlertEvidenceImageUrl(evidenceId) {
  const token = getSessionToken();
  const response = await fetch(buildUrl(`/api/alert-evidence/${evidenceId}/image`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const error = new Error(payload?.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function markAlertsSeen() {
  return request('/api/alerts/seen', { method: 'POST' });
}
