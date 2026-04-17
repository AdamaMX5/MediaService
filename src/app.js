const express = require('express');
const cors = require('cors');

const app = express();

const rawOrigins = process.env.CORS_ORIGINS || '';
const allowedOrigins = rawOrigins
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length === 0
    ? false
    : (origin, callback) => {
        // Allow requests with no origin (e.g. curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      },
  credentials: true,
}));

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
