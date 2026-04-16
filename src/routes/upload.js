const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const Media = require('../models/Media');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads';
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');
fs.mkdirSync(TEMP_DIR, { recursive: true });

// Allowed MIME types (empty = all allowed)
const allowedTypes = process.env.ALLOWED_MIME_TYPES
  ? process.env.ALLOWED_MIME_TYPES.split(',').map((t) => t.trim()).filter(Boolean)
  : null;

const maxFileSize = parseInt(process.env.MAX_FILE_SIZE, 10) || 0;

const upload = multer({
  dest: TEMP_DIR,
  limits: maxFileSize > 0 ? { fileSize: maxFileSize } : {},
  fileFilter: (_req, file, cb) => {
    if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
      return cb(new Error(`MIME type "${file.mimetype}" is not allowed`));
    }
    cb(null, true);
  },
});

/**
 * Strips ".." and leading slashes to prevent path traversal.
 * Allows nested paths like "projects/design/assets".
 */
function sanitizeFolder(raw) {
  if (!raw) return '';
  return raw
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}

/**
 * POST /upload
 * Multipart body:
 *   file        – the file (required)
 *   app_name    – e.g. "VirtualOffice" (required)
 *   folder      – optional subfolder path, e.g. "projects/design"
 *   name        – optional display name
 *   description – optional description
 */
router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const { app_name, folder: rawFolder, name, description } = req.body;

  if (!app_name) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'app_name is required' });
  }

  const folder = sanitizeFolder(rawFolder);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const stored_name = `${uuidv4()}${ext}`;

  const targetDir = path.join(UPLOAD_DIR, app_name, folder);
  const targetPath = path.join(targetDir, stored_name);

  // Path traversal guard
  if (!path.resolve(targetPath).startsWith(path.resolve(UPLOAD_DIR))) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });

    try {
      fs.renameSync(req.file.path, targetPath);
    } catch {
      // Fallback for cross-device moves (different filesystems)
      fs.copyFileSync(req.file.path, targetPath);
      fs.unlinkSync(req.file.path);
    }

    const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const urlPath = folder ? `${app_name}/${folder}/${stored_name}` : `${app_name}/${stored_name}`;
    const url = `${baseUrl}/files/${urlPath}`;

    const media = new Media({
      app_name,
      folder,
      stored_name,
      original_name: req.file.originalname,
      name: name || req.file.originalname,
      description: description || '',
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploaded_by: req.user.id || req.user.sub,
      uploaded_by_email: req.user.email || '',
      url,
    });

    await media.save();
    res.status(201).json(media);
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch {}
    next(err);
  }
});

module.exports = router;
