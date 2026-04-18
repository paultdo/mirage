import 'dotenv/config';
import { deleteSession, getSessionWithUser } from './db.js';

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || '24');
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

function unauthorized(res) {
  return res.status(401).json({ error: 'unauthorized' });
}

function readBearerToken(headerValue) {
  if (!headerValue || !headerValue.startsWith('Bearer ')) {
    return null;
  }

  return headerValue.slice('Bearer '.length).trim() || null;
}

function isExpired(session) {
  return session.created_at + SESSION_TTL_MS <= Date.now();
}

async function attachSession(req, res, next) {
  const token = readBearerToken(req.get('Authorization'));

  if (!token) {
    return unauthorized(res);
  }

  const record = getSessionWithUser(token);
  if (!record) {
    return unauthorized(res);
  }

  if (isExpired(record.session)) {
    deleteSession(token);
    return unauthorized(res);
  }

  req.session = record.session;
  req.user = record.user;
  return next();
}

export const requireSession = [attachSession];

export const requirePendingSession = [
  attachSession,
  (req, res, next) => {
    if (req.session.mode !== 'pending') {
      return res.status(401).json({ error: 'unauthorized' });
    }

    return next();
  },
];

export const requireAuthenticatedSession = [
  attachSession,
  (req, res, next) => {
    if (req.session.mode === 'pending') {
      return res.status(401).json({ error: 'session_pending' });
    }

    return next();
  },
];
