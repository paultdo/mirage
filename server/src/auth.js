import 'dotenv/config';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import {
  clearPendingSessionsForUser,
  createSession,
  createUser,
  findUserByEmail,
  setFaceEmbedding,
  updateSessionMode,
} from './db.js';

const FACE_THRESHOLD = Number(process.env.FACE_THRESHOLD || '0.95');
const DEMO_MODE = String(process.env.DEMO_MODE || 'false').toLowerCase() === 'true';
const DEMO_DURESS_PASSWORD = process.env.DEMO_DURESS_PASSWORD || '';

function now() {
  return Date.now();
}

function createSessionRecord(userId, mode) {
  const session = {
    token: uuidv4(),
    user_id: userId,
    mode,
    created_at: now(),
  };

  createSession(session);
  return session;
}

function isWeakPassword(password) {
  return typeof password !== 'string' || password.trim().length < 8;
}

export function validateEmbedding(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== 128) {
    throw new Error('invalid_embedding');
  }

  const normalized = embedding.map((value) => Number(value));
  const isValid = normalized.every((value) => Number.isFinite(value));

  if (!isValid) {
    throw new Error('invalid_embedding');
  }

  return normalized;
}

export function cosineSimilarity(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return -1;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export async function signup(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;

  if (!email) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  if (isWeakPassword(password)) {
    return res.status(400).json({ error: 'weak_password' });
  }

  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'email_taken' });
  }

  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, 12);

  createUser({
    id: userId,
    email,
    password_hash: passwordHash,
    face_embedding: null,
    created_at: now(),
  });

  const session = createSessionRecord(userId, 'pending');

  return res.json({
    session_token: session.token,
    user_id: userId,
    needs_enrollment: true,
  });
}

export async function login(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = findUserByEmail(email);

  if (!email || !password || !user) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  if (DEMO_MODE && DEMO_DURESS_PASSWORD && password === DEMO_DURESS_PASSWORD) {
    clearPendingSessionsForUser(user.id);
    const session = createSessionRecord(user.id, 'decoy');
    return res.json({
      session_token: session.token,
      logged_in: true,
    });
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  clearPendingSessionsForUser(user.id);
  const session = createSessionRecord(user.id, 'pending');

  return res.json({
    session_token: session.token,
    needs_face_check: true,
  });
}

export function enrollFace(req, res) {
  let embedding;

  try {
    embedding = validateEmbedding(req.body?.embedding);
  } catch (error) {
    return res.status(400).json({ error: 'invalid_embedding' });
  }

  setFaceEmbedding(req.user.id, embedding);
  return res.json({ enrolled: true });
}

export function verifyFace(req, res) {
  let embedding;

  try {
    embedding = validateEmbedding(req.body?.embedding);
  } catch (error) {
    return res.status(400).json({ error: 'invalid_embedding' });
  }

  if (!req.user.face_embedding) {
    return res.status(400).json({ error: 'not_enrolled' });
  }

  let storedEmbedding;
  try {
    storedEmbedding = JSON.parse(req.user.face_embedding);
  } catch (error) {
    return res.status(500).json({ error: 'server_error' });
  }

  const similarity = cosineSimilarity(storedEmbedding, embedding);
  const nextMode = similarity >= FACE_THRESHOLD ? 'real' : 'decoy';
  console.log(
    `[auth] verify-face user=${req.user.email} similarity=${similarity.toFixed(4)} mode=${nextMode}`,
  );
  updateSessionMode(req.session.token, nextMode);

  return res.json({ logged_in: true });
}

export function me(req, res) {
  return res.json({
    email: req.user.email,
    enrolled: Boolean(req.user.face_embedding),
  });
}
