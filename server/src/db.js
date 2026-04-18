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
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

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
    INSERT INTO sessions (token, user_id, mode, created_at)
    VALUES (@token, @user_id, @mode, @created_at)
  `),
  findSessionWithUser: db.prepare(`
    SELECT
      s.token,
      s.user_id,
      s.mode,
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

export { db, dbPath };
