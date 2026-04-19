import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  dataDir,
  insertFile,
  getFilesByOwner,
  getFileById,
  deleteFileById,
  insertDecoyCache,
  getDecoyCache,
  insertAlert,
  getAlertsByUser,
  markAlertsSeen,
} from './db.js';
import { generateDecoyFilename, generateDecoyContent } from './ollama.js';

function sanitizeFilename(filename) {
  // Strip path traversal and keep only the basename
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function filePath(fileId, filename) {
  return path.join(dataDir, `${fileId}_${sanitizeFilename(filename)}`);
}

// POST /api/files
export async function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'no_file' });
  }

  const coverTopic = String(req.body?.cover_topic || '').trim();
  if (!coverTopic) {
    return res.status(400).json({ error: 'missing_cover_topic' });
  }

  const fileId = uuidv4();
  const realFilename = req.file.originalname;
  const mimeType = req.file.mimetype || 'application/octet-stream';
  const sizeBytes = req.file.size;
  const now = Date.now();

  // Decoy mode: accept upload, return fake success, discard actual file, log alert
  if (req.session.mode === 'decoy') {
    // Delete the temp file multer saved — don't persist the real data
    fs.unlink(req.file.path, () => {});

    insertAlert({
      id: uuidv4(),
      user_id: req.user.id,
      event_type: 'file_uploaded',
      file_id: fileId,
      file_name: realFilename,
      created_at: now,
    });

    return res.json({
      id: fileId,
      name: realFilename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_at: now,
    });
  }

  // Real mode: save file, generate decoy, store in DB
  const destPath = filePath(fileId, realFilename);
  fs.renameSync(req.file.path, destPath);

  // Generate decoy filename + content via Ollama (with fallback)
  const decoyFilename = await generateDecoyFilename(coverTopic);
  const decoyContent = await generateDecoyContent(coverTopic, decoyFilename);

  insertFile({
    id: fileId,
    owner_id: req.user.id,
    real_filename: realFilename,
    decoy_filename: decoyFilename,
    cover_topic: coverTopic,
    size_bytes: sizeBytes,
    mime_type: mimeType,
    created_at: now,
  });

  insertDecoyCache({
    file_id: fileId,
    content: decoyContent,
    generated_at: now,
  });

  console.log(`[files] uploaded file=${fileId} real="${realFilename}" decoy="${decoyFilename}"`);

  return res.json({
    id: fileId,
    name: realFilename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    created_at: now,
  });
}

// GET /api/files
export function listFiles(req, res) {
  const rows = getFilesByOwner(req.user.id);
  const isDecoy = req.session.mode === 'decoy';

  const files = rows.map((row) => ({
    id: row.id,
    name: isDecoy ? row.decoy_filename : row.real_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
  }));

  return res.json({ files });
}

// GET /api/files/:id/content
export function getFileContent(req, res) {
  const file = getFileById(req.params.id);

  if (!file || file.owner_id !== req.user.id) {
    return res.status(404).json({ error: 'not_found' });
  }

  const isDecoy = req.session.mode === 'decoy';

  if (isDecoy) {
    // Log that someone viewed this file in decoy mode
    insertAlert({
      id: uuidv4(),
      user_id: req.user.id,
      event_type: 'file_viewed',
      file_id: file.id,
      file_name: file.decoy_filename,
      created_at: Date.now(),
    });

    const cached = getDecoyCache(file.id);
    if (cached) {
      return res.type('text/plain').send(cached);
    }

    // Fallback if cache is somehow missing
    return res.type('text/plain').send('Document content is being prepared.');
  }

  // Real mode: serve actual file from disk
  const realPath = filePath(file.id, file.real_filename);

  if (!fs.existsSync(realPath)) {
    return res.status(404).json({ error: 'file_missing' });
  }

  return res.type(file.mime_type).sendFile(realPath);
}

// DELETE /api/files/:id
export function deleteFile(req, res) {
  const file = getFileById(req.params.id);

  if (!file || file.owner_id !== req.user.id) {
    return res.status(404).json({ error: 'not_found' });
  }

  const isDecoy = req.session.mode === 'decoy';

  if (isDecoy) {
    // Don't actually delete — log alert and return success
    insertAlert({
      id: uuidv4(),
      user_id: req.user.id,
      event_type: 'file_deleted',
      file_id: file.id,
      file_name: file.decoy_filename,
      created_at: Date.now(),
    });

    return res.json({ deleted: true });
  }

  // Real mode: actually delete
  const realPath = filePath(file.id, file.real_filename);
  fs.unlink(realPath, () => {}); // best-effort disk cleanup
  deleteFileById(file.id);

  console.log(`[files] deleted file=${file.id} "${file.real_filename}"`);
  return res.json({ deleted: true });
}

// GET /api/alerts
export function listAlerts(req, res) {
  // Decoy users should see no alerts — they shouldn't know they're being watched
  if (req.session.mode === 'decoy') {
    return res.json({ alerts: [] });
  }

  const alerts = getAlertsByUser(req.user.id);
  return res.json({ alerts });
}

// POST /api/alerts/seen
export function markAlertsRead(req, res) {
  if (req.session.mode !== 'decoy') {
    markAlertsSeen(req.user.id);
  }

  return res.json({ ok: true });
}
