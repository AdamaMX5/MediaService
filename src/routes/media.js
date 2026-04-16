const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const Media = require('../models/Media');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads';

/**
 * GET /media/:id
 * Returns the metadata of a single file (authentication required).
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id).select('-__v');
    if (!media) return res.status(404).json({ error: 'File not found' });
    res.json(media);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /media/:id
 * Deletes a file. Users may only delete files they uploaded themselves.
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'File not found' });

    const userId = req.user.id || req.user.sub;
    if (media.uploaded_by !== userId) {
      return res.status(403).json({ error: 'You can only delete your own files' });
    }

    const fullPath = path.join(UPLOAD_DIR, media.app_name, media.folder, media.stored_name);
    try { fs.unlinkSync(fullPath); } catch {}

    await media.deleteOne();
    res.json({ message: 'File deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
