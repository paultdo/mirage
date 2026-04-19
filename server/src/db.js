import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

function resolveDbPath() {
  const configured = process.env.DB_PATH || './data/mirage.db';
  return path.resolve(process.cwd(), configured);
}

function ensureDbDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const dbPath = resolveDbPath();
ensureDbDirectory(dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    face_embedding TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('pending', 'real', 'decoy')),
    password_used TEXT CHECK (password_used IN ('real', 'duress')),
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    real_filename TEXT NOT NULL,
    decoy_filename TEXT NOT NULL,
    cover_topic TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS decoy_cache (
    file_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    generated_at INTEGER NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS intrusion_alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('file_viewed', 'file_deleted', 'file_uploaded')),
    file_id TEXT,
    file_name TEXT NOT NULL,
    evidence_id TEXT,
    created_at INTEGER NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS decoy_evidence (
    id TEXT PRIMARY KEY,
    session_token TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    image_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_token) REFERENCES sessions(token) ON DELETE CASCADE
  );
`);

// Migrate existing sessions table if needed
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN password_used TEXT CHECK (password_used IN ('real', 'duress'))`);
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE intrusion_alerts ADD COLUMN evidence_id TEXT`);
} catch {
  // Column already exists
}

// Ensure the real-file storage directory exists
const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || './data/real');
fs.mkdirSync(dataDir, { recursive: true });
const evidenceDir = path.resolve(process.cwd(), process.env.EVIDENCE_DIR || './data/evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const statements = {
  createUser: db.prepare(`
    INSERT INTO users (id, email, password_hash, face_embedding, created_at)
    VALUES (@id, @email, @password_hash, @face_embedding, @created_at)
  `),
  findUserByEmail: db.prepare(`
    SELECT id, email, password_hash, face_embedding, created_at
    FROM users
    WHERE email = ?
  `),
  findUserById: db.prepare(`
    SELECT id, email, password_hash, face_embedding, created_at
    FROM users
    WHERE id = ?
  `),
  updateFaceEmbedding: db.prepare(`
    UPDATE users
    SET face_embedding = @face_embedding
    WHERE id = @user_id
  `),
  createSession: db.prepare(`
    INSERT INTO sessions (token, user_id, mode, password_used, created_at)
    VALUES (@token, @user_id, @mode, @password_used, @created_at)
  `),
  findSessionWithUser: db.prepare(`
    SELECT
      s.token,
      s.user_id,
      s.mode,
      s.password_used,
      s.created_at AS session_created_at,
      u.email,
      u.password_hash,
      u.face_embedding,
      u.created_at AS user_created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `),
  updateSessionMode: db.prepare(`
    UPDATE sessions
    SET mode = @mode
    WHERE token = @token
  `),
  deleteSessionByToken: db.prepare(`
    DELETE FROM sessions
    WHERE token = ?
  `),
  deleteSessionsForUserByMode: db.prepare(`
    DELETE FROM sessions
    WHERE user_id = @user_id AND mode = @mode
  `),

  // Files
  insertFile: db.prepare(`
    INSERT INTO files (id, owner_id, real_filename, decoy_filename, cover_topic, size_bytes, mime_type, created_at)
    VALUES (@id, @owner_id, @real_filename, @decoy_filename, @cover_topic, @size_bytes, @mime_type, @created_at)
  `),
  getFilesByOwner: db.prepare(`
    SELECT id, owner_id, real_filename, decoy_filename, cover_topic, size_bytes, mime_type, created_at
    FROM files WHERE owner_id = ? ORDER BY created_at DESC
  `),
  getFileById: db.prepare(`
    SELECT id, owner_id, real_filename, decoy_filename, cover_topic, size_bytes, mime_type, created_at
    FROM files WHERE id = ?
  `),
  deleteFile: db.prepare(`DELETE FROM files WHERE id = ?`),

  // Decoy cache
  insertDecoyCache: db.prepare(`
    INSERT INTO decoy_cache (file_id, content, generated_at)
    VALUES (@file_id, @content, @generated_at)
  `),
  getDecoyCache: db.prepare(`SELECT content FROM decoy_cache WHERE file_id = ?`),
  deleteDecoyCache: db.prepare(`DELETE FROM decoy_cache WHERE file_id = ?`),

  // Intrusion alerts
  insertAlert: db.prepare(`
    INSERT INTO intrusion_alerts (id, user_id, event_type, file_id, file_name, evidence_id, created_at)
    VALUES (@id, @user_id, @event_type, @file_id, @file_name, @evidence_id, @created_at)
  `),
  getAlertsByUser: db.prepare(`
    SELECT id, event_type, file_id, file_name, evidence_id, created_at, seen
    FROM intrusion_alerts WHERE user_id = ? ORDER BY created_at DESC
  `),
  getAlertByIdForUser: db.prepare(`
    SELECT id, user_id, event_type, file_id, file_name, evidence_id, created_at, seen
    FROM intrusion_alerts
    WHERE id = ? AND user_id = ?
  `),
  markAlertsSeen: db.prepare(`
    UPDATE intrusion_alerts SET seen = 1 WHERE user_id = ? AND seen = 0
  `),
  insertDecoyEvidence: db.prepare(`
    INSERT OR REPLACE INTO decoy_evidence (id, session_token, user_id, image_path, mime_type, captured_at)
    VALUES (@id, @session_token, @user_id, @image_path, @mime_type, @captured_at)
  `),
  getDecoyEvidenceBySessionToken: db.prepare(`
    SELECT id, session_token, user_id, image_path, mime_type, captured_at
    FROM decoy_evidence
    WHERE session_token = ?
  `),
  getDecoyEvidenceByIdForUser: db.prepare(`
    SELECT id, session_token, user_id, image_path, mime_type, captured_at
    FROM decoy_evidence
    WHERE id = ? AND user_id = ?
  `),
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function createUser(user) {
  statements.createUser.run(user);
}

export function findUserByEmail(email) {
  return statements.findUserByEmail.get(normalizeEmail(email)) || null;
}

export function findUserById(userId) {
  return statements.findUserById.get(userId) || null;
}

export function setFaceEmbedding(userId, embedding) {
  statements.updateFaceEmbedding.run({
    user_id: userId,
    face_embedding: JSON.stringify(embedding),
  });
}

export function createSession(session) {
  statements.createSession.run(session);
}

export function getSessionWithUser(token) {
  const row = statements.findSessionWithUser.get(token);
  if (!row) {
    return null;
  }

  return {
    session: {
      token: row.token,
      user_id: row.user_id,
      mode: row.mode,
      password_used: row.password_used,
      created_at: row.session_created_at,
    },
    user: {
      id: row.user_id,
      email: row.email,
      password_hash: row.password_hash,
      face_embedding: row.face_embedding,
      created_at: row.user_created_at,
    },
  };
}

export function updateSessionMode(token, mode) {
  statements.updateSessionMode.run({ token, mode });
}

export function deleteSession(token) {
  statements.deleteSessionByToken.run(token);
}

export function clearPendingSessionsForUser(userId) {
  statements.deleteSessionsForUserByMode.run({ user_id: userId, mode: 'pending' });
}

// --- File operations ---

export function insertFile(file) {
  statements.insertFile.run(file);
}

export function getFilesByOwner(ownerId) {
  return statements.getFilesByOwner.all(ownerId);
}

export function getFileById(fileId) {
  return statements.getFileById.get(fileId) || null;
}

export function deleteFileById(fileId) {
  statements.deleteDecoyCache.run(fileId);
  statements.deleteFile.run(fileId);
}

// --- Decoy cache ---

export function insertDecoyCache(entry) {
  statements.insertDecoyCache.run(entry);
}

export function getDecoyCache(fileId) {
  const row = statements.getDecoyCache.get(fileId);
  return row ? row.content : null;
}

// --- Intrusion alerts ---

export function insertAlert(alert) {
  statements.insertAlert.run(alert);
}

export function getAlertsByUser(userId) {
  return statements.getAlertsByUser.all(userId);
}

export function getAlertByIdForUser(alertId, userId) {
  return statements.getAlertByIdForUser.get(alertId, userId) || null;
}

export function markAlertsSeen(userId) {
  statements.markAlertsSeen.run(userId);
}

export function insertDecoyEvidence(evidence) {
  statements.insertDecoyEvidence.run(evidence);
}

export function getDecoyEvidenceBySessionToken(sessionToken) {
  return statements.getDecoyEvidenceBySessionToken.get(sessionToken) || null;
}

export function getDecoyEvidenceByIdForUser(evidenceId, userId) {
  return statements.getDecoyEvidenceByIdForUser.get(evidenceId, userId) || null;
}

export { db, dbPath, dataDir, evidenceDir };
