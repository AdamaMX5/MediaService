const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const Media = require('../models/Media');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads';

// All /admin routes require a valid JWT with ADMIN role
router.use(authenticate, requireAdmin);

/**
 * GET /admin/media
 * Lists all stored files with optional query filters.
 *
 * Query params:
 *   app_name     – filter by app
 *   folder       – filter by exact folder path
 *   uploaded_by  – filter by user id
 *   page         – pagination page (default 1)
 *   limit        – results per page (default 50)
 */
router.get('/media', async (req, res) => {
  const { app_name, folder, uploaded_by, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (app_name) filter.app_name = app_name;
  if (folder !== undefined) filter.folder = folder;
  if (uploaded_by) filter.uploaded_by = uploaded_by;

  try {
    const [total, files] = await Promise.all([
      Media.countDocuments(filter),
      Media.find(filter)
        .select('-__v')
        .sort({ created_at: -1 })
        .skip((parseInt(page, 10) - 1) * parseInt(limit, 10))
        .limit(parseInt(limit, 10)),
    ]);

    res.json({ total, page: parseInt(page, 10), limit: parseInt(limit, 10), files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/media/:id
 * Deletes any file regardless of who uploaded it.
 */
router.delete('/media/:id', async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ error: 'File not found' });

    const fullPath = path.join(UPLOAD_DIR, media.app_name, media.folder, media.stored_name);
    try { fs.unlinkSync(fullPath); } catch {}

    await media.deleteOne();
    res.json({ message: 'File deleted by admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
