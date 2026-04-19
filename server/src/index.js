import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { dbPath, dataDir } from './db.js';
import { enrollFace, login, me, signup, verifyFace } from './auth.js';
import { requirePendingSession, requireSession, requireAuthenticatedSession } from './session.js';
import { pingOllama } from './ollama.js';
import { uploadFile, listFiles, getFileContent, deleteFile, listAlerts, markAlertsRead } from './files.js';

const upload = multer({
  dest: dataDir + '/.uploads',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

const app = express();
const port = Number(process.env.PORT || '3000');
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', wrap(async (req, res) => {
  const ollama = await pingOllama();
  res.json({ backend: 'ok', db_path: dbPath, ollama });
}));

app.post('/api/signup', wrap(signup));
app.post('/api/login', wrap(login));
app.post('/api/enroll-face', requirePendingSession, wrap(enrollFace));
app.post('/api/verify-face', requirePendingSession, wrap(verifyFace));
app.get('/api/me', requireSession, wrap(me));

// File routes
app.post('/api/files', requireAuthenticatedSession, upload.single('file'), wrap(uploadFile));
app.get('/api/files', requireAuthenticatedSession, wrap(listFiles));
app.get('/api/files/:id/content', requireAuthenticatedSession, wrap(getFileContent));
app.delete('/api/files/:id', requireAuthenticatedSession, wrap(deleteFile));

// Alert routes
app.get('/api/alerts', requireAuthenticatedSession, wrap(listAlerts));
app.post('/api/alerts/seen', requireAuthenticatedSession, wrap(markAlertsRead));

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({ error: 'server_error' });
});

app.listen(port, () => {
  console.log(`Mirage server listening on http://localhost:${port}`);
  console.log(`SQLite database: ${dbPath}`);
});

function wrap(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}
