const express = require('express');
const { authenticate } = require('../middleware/auth');
const Media = require('../models/Media');

const router = express.Router();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizePath(raw) {
  return raw
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}

/**
 * Derives the direct child folder names one level below `currentPath`.
 * e.g. currentPath="projects", stored folders ["projects/design", "projects/dev/assets"]
 *      → ["design", "dev"]
 */
async function getDirectSubfolders(app_name, currentPath) {
  const prefix = currentPath ? `${currentPath}/` : '';
  const regex = prefix
    ? new RegExp(`^${escapeRegex(prefix)}`)
    : /.+/; // root: any non-empty folder

  const allFolders = await Media.distinct('folder', {
    app_name,
    folder: currentPath === '' ? { $ne: '' } : { $regex: regex },
  });

  return [
    ...new Set(
      allFolders.map((f) => {
        const relative = prefix ? f.slice(prefix.length) : f;
        return relative.split('/')[0];
      })
    ),
  ].sort();
}

/**
 * GET /browse/:app_name
 * Lists the root of an app: direct subfolders + files at root level.
 */
router.get('/:app_name', authenticate, async (req, res) => {
  const { app_name } = req.params;
  try {
    const [files, folders] = await Promise.all([
      Media.find({ app_name, folder: '' }).select('-__v').sort({ created_at: -1 }),
      getDirectSubfolders(app_name, ''),
    ]);

    res.json({ path: app_name, folders, files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /browse/:app_name/*
 * Lists a subfolder: direct child folders + files in that exact folder.
 *
 * Example: GET /browse/VirtualOffice/projects/design
 */
router.get('/:app_name/*', authenticate, async (req, res) => {
  const { app_name } = req.params;
  const currentPath = sanitizePath(req.params[0]);

  if (!currentPath) {
    return res.redirect(`/browse/${app_name}`);
  }

  try {
    const [files, folders] = await Promise.all([
      Media.find({ app_name, folder: currentPath }).select('-__v').sort({ created_at: -1 }),
      getDirectSubfolders(app_name, currentPath),
    ]);

    res.json({ path: `${app_name}/${currentPath}`, folders, files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
