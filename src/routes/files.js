const express = require('express');
const path = require('path');
const Media = require('../models/Media');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads';

/**
 * GET /files/:app_name/*
 *
 * Publicly serves a media file by its path.
 * The path segments after /files/ map to: app_name / folder / stored_name
 *
 * Examples:
 *   /files/VirtualOffice/abc123.jpg
 *   /files/VirtualOffice/projects/design/abc123.jpg
 */
router.get('/:app_name/*', async (req, res) => {
  const { app_name } = req.params;
  const filePath = req.params[0];

  const stored_name = path.basename(filePath);
  const folderRaw = path.dirname(filePath);
  const folder = folderRaw === '.' ? '' : folderRaw;

  try {
    const media = await Media.findOne({ app_name, folder, stored_name });
    if (!media) return res.status(404).json({ error: 'File not found' });

    const fullPath = path.resolve(path.join(UPLOAD_DIR, app_name, folder, stored_name));

    // Path traversal guard
    if (!fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    res.setHeader('Content-Type', media.mimetype);
    res.sendFile(fullPath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
