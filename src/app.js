const express = require('express');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: "Hello World! I'm the MediaService." });
});

app.get('/health', async (req, res) => {
  try {
    const Media = require('./models/Media');
    const totalFiles = await Media.countDocuments();
    res.json({ status: 'ok', service: 'MediaService', totalFiles });
  } catch {
    res.status(503).json({ status: 'error', service: 'MediaService' });
  }
});

app.use('/upload', require('./routes/upload'));
app.use('/files', require('./routes/files'));
app.use('/media', require('./routes/media'));
app.use('/browse', require('./routes/browse'));
app.use('/admin', require('./routes/admin'));

// Global error handler for Multer and others
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
