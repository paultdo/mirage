import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  dataDir,
  deleteFileById,
  getAlertByIdForUser,
  getAlertsByUser,
  getDecoyEvidenceByIdForUser,
  getDecoyEvidenceBySessionToken,
  getDecoyCache,
  getFileById,
  getFilesByOwner,
  insertAlert,
  insertDecoyCache,
  insertFile,
  markAlertsSeen,
} from './db.js';
import { generateDecoyContent, generateDecoyFilename } from './ollama.js';

function sanitizeFilename(filename) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function filePath(fileId, filename) {
  return path.join(dataDir, `${fileId}_${sanitizeFilename(filename)}`);
}

function getSessionEvidenceId(sessionToken) {
  return getDecoyEvidenceBySessionToken(sessionToken)?.id || null;
}

function buildEvidenceImageUrl(evidenceId) {
  return `/api/alert-evidence/${evidenceId}/image`;
}

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

  if (req.session.mode === 'decoy') {
    const evidenceId = getSessionEvidenceId(req.session.token);
    fs.unlink(req.file.path, () => {});

    insertAlert({
      id: uuidv4(),
      user_id: req.user.id,
      event_type: 'file_uploaded',
      file_id: fileId,
      file_name: realFilename,
      evidence_id: evidenceId,
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

  const destPath = filePath(fileId, realFilename);
  fs.renameSync(req.file.path, destPath);

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

export function getFileContent(req, res) {
  const file = getFileById(req.params.id);

  if (!file || file.owner_id !== req.user.id) {
    return res.status(404).json({ error: 'not_found' });
  }

  const isDecoy = req.session.mode === 'decoy';

  if (isDecoy) {
    const evidenceId = getSessionEvidenceId(req.session.token);

    insertAlert({
      id: uuidv4(),
      user_id: req.user.id,
      event_type: 'file_viewed',
      file_id: file.id,
      file_name: file.decoy_filename,
      evidence_id: evidenceId,
      created_at: Date.now(),
    });

    const cached = getDecoyCache(file.id);
    if (cached) {
      return res.type('text/plain').send(cached);
    }

    return res.type('text/plain').send('Document content is being prepared.');
  }

  const realPath = filePath(file.id, file.real_filename);
  if (!fs.existsSync(realPath)) {
    return res.status(404).json({ error: 'file_missing' });
  }

  return res.type(file.mime_type).sendFile(realPath);
}

export function deleteFile(req, res) {
  const file = getFileById(req.params.id);

  if (!file || file.owner_id !== req.user.id) {
    return res.status(404).json({ error: 'not_found' });
  }

  const isDecoy = req.session.mode === 'decoy';

  if (isDecoy) {
    const evidenceId = getSessionEvidenceId(req.session.token);

    insertAlert({
      id: uuidv4(),
      user_id: req.user.id,
      event_type: 'file_deleted',
      file_id: file.id,
      file_name: file.decoy_filename,
      evidence_id: evidenceId,
      created_at: Date.now(),
    });

    return res.json({ deleted: true });
  }

  const realPath = filePath(file.id, file.real_filename);
  fs.unlink(realPath, () => {});
  deleteFileById(file.id);

  console.log(`[files] deleted file=${file.id} "${file.real_filename}"`);
  return res.json({ deleted: true });
}

function resolveRealFilename(alert, userId) {
  if (!alert.file_id || alert.event_type === 'file_uploaded') {
    return null;
  }
  const file = getFileById(alert.file_id);
  if (!file || file.owner_id !== userId) {
    return null;
  }
  return file.real_filename;
}

export function listAlerts(req, res) {
  if (req.session.mode === 'decoy') {
    return res.json({ alerts: [] });
  }

  const alerts = getAlertsByUser(req.user.id).map((alert) => ({
    ...alert,
    real_file_name: resolveRealFilename(alert, req.user.id),
  }));
  return res.json({ alerts });
}

export function getAlertDetails(req, res) {
  if (req.session.mode === 'decoy') {
    return res.status(404).json({ error: 'not_found' });
  }

  const alert = getAlertByIdForUser(req.params.id, req.user.id);
  if (!alert) {
    return res.status(404).json({ error: 'not_found' });
  }

  const evidence = alert.evidence_id
    ? getDecoyEvidenceByIdForUser(alert.evidence_id, req.user.id)
    : null;

  return res.json({
    alert: {
      id: alert.id,
      event_type: alert.event_type,
      file_id: alert.file_id,
      file_name: alert.file_name,
      real_file_name: resolveRealFilename(alert, req.user.id),
      evidence_id: alert.evidence_id,
      created_at: alert.created_at,
      seen: Boolean(alert.seen),
    },
    evidence: evidence
      ? {
        id: evidence.id,
        captured_at: evidence.captured_at,
        mime_type: evidence.mime_type,
        image_url: buildEvidenceImageUrl(evidence.id),
      }
      : null,
  });
}

export function getAlertEvidenceImage(req, res) {
  if (req.session.mode === 'decoy') {
    return res.status(404).json({ error: 'not_found' });
  }

  const evidence = getDecoyEvidenceByIdForUser(req.params.id, req.user.id);
  if (!evidence || !fs.existsSync(evidence.image_path)) {
    return res.status(404).json({ error: 'not_found' });
  }

  return res.type(evidence.mime_type).sendFile(evidence.image_path);
}

export function markAlertsRead(req, res) {
  if (req.session.mode !== 'decoy') {
    markAlertsSeen(req.user.id);
  }

  return res.json({ ok: true });
}
